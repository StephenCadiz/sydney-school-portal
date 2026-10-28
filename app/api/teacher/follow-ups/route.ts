import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORIES = new Set([
  "Academic",
  "Behaviour",
  "Homework",
  "Attendance",
  "Other",
]);
const STATUSES = new Set(["Open", "In Progress", "Resolved"]);

type Actor = { id: string; role: string };
type FollowUpRequest = {
  class_id?: unknown;
  student_type?: unknown;
  student_id?: unknown;
  young_learner_id?: unknown;
  category?: unknown;
  status?: unknown;
  details?: unknown;
  action_plan?: unknown;
};
type FollowUpDocument = { id: string; [key: string]: unknown };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function formatError(error: unknown) {
  const value = (error || {}) as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
  };
  return [value.message, value.details, value.hint, value.code]
    .filter(Boolean)
    .join(" ") || "Unknown error";
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function authenticate(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return { actor: null, response: jsonError("Authentication required.", 401) };
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return { actor: null, response: jsonError("Invalid authentication token.", 401) };
  }

  const { data: actor, error: actorError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (actorError) {
    console.error("Follow-up actor lookup failed:", formatError(actorError));
    return { actor: null, response: jsonError("Unable to verify staff access.", 500) };
  }

  if (!actor || !["teacher", "admin"].includes(String(actor.role))) {
    return { actor: null, response: jsonError("Teacher or admin access required.", 403) };
  }

  return { actor, response: null };
}

async function verifyClassAndStudent(
  actor: Actor,
  classId: string,
  studentType: string,
  studentId: string
) {
  const { data: classRow, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, teacher_id, is_cambridge")
    .eq("id", classId)
    .maybeSingle();

  if (classError) throw classError;
  if (!classRow) return { response: jsonError("Class was not found.", 404) };

  if (actor.role === "teacher" && String(classRow.teacher_id) !== actor.id) {
    return { response: jsonError("You can only create follow-ups in your own class.", 403) };
  }

  if (studentType === "young_learner") {
    if (classRow.is_cambridge === true) {
      return { response: jsonError("This learner is not in the selected class.", 403) };
    }

    // Use the roster view, not young_learners.class_id. The latter is a
    // legacy field and can remain on the previous class after an effective-
    // dated enrolment moves a learner to a new teacher's class.
    const { data: learner, error: learnerError } = await supabaseAdmin
      .from("class_roster_young_learners")
      .select("id")
      .eq("id", studentId)
      .eq("class_id", classId)
      .eq("active", true)
      .maybeSingle();

    if (learnerError) throw learnerError;
    if (!learner) {
      return { response: jsonError("The student is not enrolled in this class.", 403) };
    }
  } else {
    if (classRow.is_cambridge !== true) {
      return { response: jsonError("This student is not in the selected class.", 403) };
    }

    // Profile roster rows expose the student's legacy `active` flag, which is
    // nullable for valid Cambridge students. Use the date-effective enrolment
    // view instead so a nullable profile flag cannot make a current enrolment
    // look invalid (and so future/ended enrolments remain excluded).
    const { data: student, error: studentError } = await supabaseAdmin
      .from("current_class_enrolments")
      .select("student_id")
      .eq("student_id", studentId)
      .eq("class_id", classId)
      .eq("active", true)
      .maybeSingle();

    if (studentError) throw studentError;
    if (!student) {
      return { response: jsonError("The student is not enrolled in this class.", 403) };
    }
  }

  return { classRow, response: null };
}

async function loadEntries(documentId: string) {
  const { data: entries, error: entriesError } = await supabaseAdmin
    .from("follow_up_entries")
    .select("*")
    .eq("follow_up_document_id", documentId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (entriesError) throw entriesError;

  const teacherIds = Array.from(
    new Set((entries || []).map((entry) => entry.teacher_id).filter(Boolean))
  );
  const { data: teachers, error: teachersError } = teacherIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", teacherIds)
    : { data: [], error: null };

  if (teachersError) throw teachersError;

  return (entries || []).map((entry) => {
    const teacher = (teachers || []).find(
      (profile) => profile.id === entry.teacher_id
    );
    return {
      ...entry,
      teacher_name: `${teacher?.first_name || ""} ${teacher?.last_name || ""}`.trim() || "Unknown teacher",
    };
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth.response || !auth.actor) return auth.response;

  let body: FollowUpRequest;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return jsonError("Invalid follow-up request.", 400);
    }
    body = parsed as FollowUpRequest;
  } catch {
    return jsonError("Invalid follow-up request.", 400);
  }

  const classId = String(body?.class_id || "").trim();
  const studentType = String(body?.student_type || "cambridge").trim();
  const studentId = String(
    studentType === "young_learner" ? body?.young_learner_id : body?.student_id
  ).trim();
  const category = String(body?.category || "Other").trim();
  const status = String(body?.status || "Open").trim();
  const details = typeof body?.details === "string" ? body.details.trim() : "";
  const actionPlan =
    typeof body?.action_plan === "string" ? body.action_plan.trim() : "";

  if (
    !UUID_PATTERN.test(classId) ||
    !UUID_PATTERN.test(studentId) ||
    !["cambridge", "young_learner"].includes(studentType)
  ) {
    return jsonError("A valid class and student are required.", 422);
  }
  if (!CATEGORIES.has(category)) return jsonError("Select a valid follow-up reason.", 422);
  if (!STATUSES.has(status)) return jsonError("Select a valid follow-up status.", 422);
  if (!details || details.length > 10000 || actionPlan.length > 10000) {
    return jsonError("Follow-up details are required and must be 10,000 characters or fewer.", 422);
  }

  try {
    const access = await verifyClassAndStudent(
      auth.actor,
      classId,
      studentType,
      studentId
    );
    if (access.response) return access.response;

    const identity = {
      student_type: studentType,
      student_id: studentType === "young_learner" ? null : studentId,
      young_learner_id: studentType === "young_learner" ? studentId : null,
    };
    const documentPayload = {
      ...identity,
      class_id: classId,
      teacher_id: auth.actor.id,
      title: `${category} Follow-Up`,
      category,
      status,
      recommend_friday_tutorial: category === "Academic",
      admin_seen: false,
      updated_at: new Date().toISOString(),
    };

    let followUpDocument: FollowUpDocument | null = null;
    const existingQuery = supabaseAdmin
      .from("follow_up_documents")
      .select("*")
      .eq("class_id", classId)
      .eq("student_type", studentType)
      .eq("category", category)
      .limit(1);
    const { data: existing, error: existingError } =
      studentType === "young_learner"
        ? await existingQuery.eq("young_learner_id", studentId).maybeSingle()
        : await existingQuery.eq("student_id", studentId).maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from("follow_up_documents")
        .update(documentPayload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      followUpDocument = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("follow_up_documents")
        .insert(documentPayload)
        .select("*")
        .single();
      if (error) {
        if (error.code !== "23505") throw error;
        const retryQuery = supabaseAdmin
          .from("follow_up_documents")
          .select("*")
          .eq("class_id", classId)
          .eq("student_type", studentType)
          .eq("category", category)
          .limit(1);
        const retry =
          studentType === "young_learner"
            ? await retryQuery.eq("young_learner_id", studentId).maybeSingle()
            : await retryQuery.eq("student_id", studentId).maybeSingle();
        if (retry.error) throw retry.error;
        followUpDocument = retry.data;
      } else {
        followUpDocument = data;
      }
    }

    if (!followUpDocument?.id) {
      return jsonError("Unable to create the follow-up document.", 500);
    }

    const { error: entryError } = await supabaseAdmin
      .from("follow_up_entries")
      .insert({
        follow_up_document_id: followUpDocument.id,
        teacher_id: auth.actor.id,
        details,
        action_plan: actionPlan || null,
      });
    if (entryError) throw entryError;

    return NextResponse.json({
      followUp: {
        ...followUpDocument,
        entries: await loadEntries(followUpDocument.id),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Follow-up save failed:", formatError(error));
    return jsonError("Unable to save the follow-up document. Please try again.", 500);
  }
}

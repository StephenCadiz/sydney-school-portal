import { supabase } from "./supabase";
import { formatClockRange } from "./timeDisplay";
import { suggestFridayTutorialFromFollowUp } from "./fridayTutorials";

function formatSupabaseError(action: string, error: any) {
  return [
    `Follow-up ${action} failed: ${error?.message || "Unknown Supabase error"}`,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function getProfileName(profile: any) {
  if (!profile) return "";

  return `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
}

function getGeneratedTitle(category: string) {
  return `${category || "Other"} Follow-Up`;
}

async function safelySuggestFridayTutorial(followUp: any) {
  if (followUp?.category !== "Academic") {
    return;
  }

  try {
    await suggestFridayTutorialFromFollowUp(followUp);
  } catch (error) {
    console.warn("Unable to suggest Friday Tutorial from follow-up:", error);
  }
}

export async function getFollowUpEntries(documentId: string) {
  const { data: entries, error } = await supabase
    .from("follow_up_entries")
    .select("*")
    .eq("follow_up_document_id", documentId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(formatSupabaseError("entry load", error));
  }

  const rows = entries || [];
  const teacherIds = Array.from(
    new Set(rows.map((entry) => entry.teacher_id).filter(Boolean))
  );

  const { data: teachers, error: teachersError } =
    teacherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds)
      : { data: [], error: null };

  if (teachersError) {
    throw new Error(formatSupabaseError("entry teacher load", teachersError));
  }

  return rows.map((entry) => {
    const teacher = (teachers || []).find(
      (profile) => profile.id === entry.teacher_id
    );
    const authorName = getProfileName(teacher) || "Unknown staff member";

    return {
      ...entry,
      teacher_name: authorName,
      author_name: authorName,
      author_role: entry.author_role || "teacher",
    };
  });
}

export async function createFollowUpEntry(documentId: string, entryData: any) {
  const { data, error } = await supabase
    .from("follow_up_entries")
    .insert([
      {
        follow_up_document_id: documentId,
        teacher_id: entryData.teacher_id,
        details: entryData.details,
        action_plan: entryData.action_plan,
      },
    ])
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError("entry save", error));
  }

  return data;
}

async function enrichFollowUpDocuments(documents: any[]) {
  if (documents.length === 0) {
    return [];
  }

  const profileIds = Array.from(
    new Set(
      documents
        .flatMap((item) => [item.student_id, item.teacher_id])
        .filter(Boolean)
    )
  );
  const youngLearnerIds = Array.from(
    new Set(documents.map((item) => item.young_learner_id).filter(Boolean))
  );
  const classIds = Array.from(
    new Set(documents.map((item) => item.class_id).filter(Boolean))
  );

  const { data: profiles, error: profilesError } =
    profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", profileIds)
      : { data: [], error: null };

  if (profilesError) {
    throw new Error(formatSupabaseError("profile load", profilesError));
  }

  const { data: youngLearners, error: youngLearnersError } =
    youngLearnerIds.length > 0
      ? await supabase
          .from("young_learners")
          .select("id, first_name, last_name")
          .in("id", youngLearnerIds)
      : { data: [], error: null };

  if (youngLearnersError) {
    throw new Error(formatSupabaseError("young learner load", youngLearnersError));
  }

  const { data: classes, error: classesError } =
    classIds.length > 0
      ? await supabase.from("classes").select("*").in("id", classIds)
      : { data: [], error: null };

  if (classesError) {
    throw new Error(formatSupabaseError("class load", classesError));
  }

  const { data: levels, error: levelsError } = await supabase
    .from("levels")
    .select("id, name");

  if (levelsError) {
    throw new Error(formatSupabaseError("level load", levelsError));
  }

  const { data: classrooms, error: classroomsError } = await supabase
    .from("classrooms")
    .select("id, name");

  if (classroomsError) {
    throw new Error(formatSupabaseError("classroom load", classroomsError));
  }

  const entriesByDocument = await Promise.all(
    documents.map(async (item) => [item.id, await getFollowUpEntries(item.id)])
  );
  const entriesMap = new Map(entriesByDocument as [string, any[]][]);

  function getProfileNameById(profileId: string) {
    const profile = (profiles || []).find((item) => item.id === profileId);
    return getProfileName(profile) || "Unknown";
  }

  function getYoungLearnerName(youngLearnerId: string) {
    const youngLearner = (youngLearners || []).find(
      (item) => item.id === youngLearnerId
    );
    return getProfileName(youngLearner) || "Unknown";
  }

  function getClassLabel(classId: string) {
    const classRow = (classes || []).find((item) => item.id === classId);

    if (!classRow) return "Unknown class";

    const level = (levels || []).find((item) => item.id === classRow.level_id);
    const assignedClassroom = (classrooms || []).find(
      (item) => item.id === classRow.classroom_id
    );
    const timeSlot =
      classRow.start_time && classRow.end_time
        ? formatClockRange(classRow.start_time, classRow.end_time, "-")
        : "-";
    const classroomName =
      classRow.course_type === "online"
        ? "Online Class"
        : assignedClassroom?.name || "No classroom assigned";

    return `${level?.name || "-"} - ${classRow.days || "-"} - ${timeSlot} - ${classroomName}`;
  }

  return documents.map((item) => ({
    ...item,
    title: item.title || getGeneratedTitle(item.category),
    student_name:
      item.student_type === "young_learner" || item.young_learner_id
        ? getYoungLearnerName(item.young_learner_id)
        : getProfileNameById(item.student_id),
    student_type_label:
      item.student_type === "young_learner" || item.young_learner_id
        ? "Young Learner"
        : "Cambridge",
    teacher_name: getProfileNameById(item.teacher_id),
    class_label: getClassLabel(item.class_id),
    entries: entriesMap.get(item.id) || [],
  }));
}

export async function getFollowUpsForClass(classId: string) {
  const { data, error } = await supabase
    .from("follow_up_documents")
    .select("*")
    .eq("class_id", classId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(formatSupabaseError("class document load", error));
  }

  return enrichFollowUpDocuments(data || []);
}

export async function createFollowUpDocument(document: any) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Follow-up save failed: authentication is required.");
  }

  const response = await fetch("/api/teacher/follow-ups", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(document),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to save the follow-up document.");
  }

  const followUp = payload?.followUp;
  if (!followUp?.id) {
    throw new Error("Follow-up save failed: the server returned no document.");
  }

  // Keep the existing Academic follow-up → Friday Tutorial suggestion. The
  // document save is now server-authorized; this best-effort side effect can
  // remain client-side and must never make the document save look failed.
  await safelySuggestFridayTutorial(followUp);
  return followUp;
}

export async function updateFollowUpDocument(id: string, updates: any) {
  const category = updates.category || "Other";
  const { data, error } = await supabase
    .from("follow_up_documents")
    .update({
      title: getGeneratedTitle(category),
      category,
      status: updates.status,
      recommend_friday_tutorial: category === "Academic",
      admin_seen: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(formatSupabaseError("document update", error));
  }

  if (updates.details) {
    await createFollowUpEntry(id, {
      teacher_id: updates.teacher_id,
      details: updates.details,
      action_plan: updates.action_plan,
    });
  }

  await safelySuggestFridayTutorial(data);

  return {
    ...data,
    entries: await getFollowUpEntries(id),
  };
}

export async function deleteFollowUpDocument(id: string) {
  const { error } = await supabase
    .from("follow_up_documents")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("document delete", error));
  }
}

export async function getAllFollowUpsForAdmin() {
  const { data: followUps, error } = await supabase
    .from("follow_up_documents")
    .select("*")
    .order("admin_seen", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(formatSupabaseError("admin document load", error));
  }

  return enrichFollowUpDocuments(followUps || []);
}

export async function getUnreviewedFollowUpsForAdmin() {
  const { data: followUps, error } = await supabase
    .from("follow_up_documents")
    .select("*")
    .eq("admin_seen", false)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(formatSupabaseError("unreviewed document load", error));
  }

  return enrichFollowUpDocuments(followUps || []);
}

export async function updateFollowUpDocumentForAdmin(
  id: string,
  updates: any
) {
  const category = updates.category || "Other";
  const { error } = await supabase
    .from("follow_up_documents")
    .update({
      title: getGeneratedTitle(category),
      category,
      status: updates.status,
      admin_seen: updates.admin_seen,
      recommend_friday_tutorial: category === "Academic",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("admin document update", error));
  }
}

export async function markFollowUpAsSeen(id: string) {
  const { error } = await supabase
    .from("follow_up_documents")
    .update({
      admin_seen: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(formatSupabaseError("mark reviewed", error));
  }
}

export async function addAdminFollowUpAction(id: string, details: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Admin action save failed: authentication is required.");
  }

  const response = await fetch(`/api/admin/follow-ups/${encodeURIComponent(id)}/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ details }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to save the Admin action.");
  }

  return payload?.entry || null;
}

export async function markFollowUpActionOpened(id: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return;

  const response = await fetch(
    `/api/teacher/follow-up-action-notices/${encodeURIComponent(id)}/open`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error || "Unable to mark the follow-up notification as opened."
    );
  }
}

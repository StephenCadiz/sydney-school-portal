import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const maxStudentsPerRequest = 12;
const maxNameLength = 80;

type RowError = {
  row: number;
  field: "first_name" | "last_name" | "student";
  message: string;
};

type SubmittedStudent = {
  row?: unknown;
  first_name?: unknown;
  last_name?: unknown;
};

type PreparedStudent = {
  row: number;
  first_name: string;
  last_name: string;
  normalized_name: string;
};

function formatError(error: unknown) {
  if (!error) {
    return "Unknown error from Supabase.";
  }

  if (typeof error === "object") {
    const errorObject = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [
      errorObject.message ? `Message: ${String(errorObject.message)}` : "",
      errorObject.details ? `Details: ${String(errorObject.details)}` : "",
      errorObject.hint ? `Hint: ${String(errorObject.hint)}` : "",
      errorObject.code ? `Code: ${String(errorObject.code)}` : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  const fallback = String(error);
  return fallback && fallback !== "[object Object]"
    ? fallback
    : "Unknown error from Supabase.";
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
    }
  );
}

function jsonValidationError(errors: RowError[], status = 400) {
  return NextResponse.json(
    {
      success: false,
      errors,
    },
    {
      status,
    }
  );
}

function normalizeRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLevelName(levelName: unknown) {
  return String(levelName || "").trim().toUpperCase();
}

function normalizeFullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getRowNumber(value: unknown, fallback: number) {
  const row = Number(value);

  return Number.isInteger(row) && row >= 1 && row <= maxStudentsPerRequest
    ? row
    : fallback;
}

function getClassroomDisplayName(classroom: any, classroomName: string) {
  if (String(classroom?.course_type || "").trim().toLowerCase() === "online") {
    return "Online Class";
  }

  return classroomName || "Not assigned";
}

function getClassLabel(classroom: any, levelName: string, classroomName: string) {
  const displayClassroomName = getClassroomDisplayName(classroom, classroomName);

  return [levelName || "Unknown level", displayClassroomName]
    .filter(Boolean)
    .join(" — ");
}

async function verifyAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.replace("Bearer ", "")
    : "";

  if (!token) {
    return {
      error: jsonError("Missing authorization token.", 401),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    console.error("Young Learner bulk create auth failed:", formatError(userError));
    return {
      error: jsonError("Invalid authorization token.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error(
      "Young Learner bulk create admin lookup failed:",
      formatError(profileError)
    );
    return {
      error: jsonError("Unable to verify admin user.", 500),
    };
  }

  if (profile?.role !== "admin") {
    return {
      error: jsonError("Only admins can create Young Learners.", 403),
    };
  }

  return { user };
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(request);

    if (adminCheck.error) {
      return adminCheck.error;
    }

    const body = (await request.json()) as {
      class_id?: unknown;
      students?: unknown;
    };
    const classId = normalizeRequiredString(body.class_id);
    const submittedStudents: SubmittedStudent[] = Array.isArray(body.students)
      ? body.students.map((student) =>
          typeof student === "object" && student !== null
            ? (student as SubmittedStudent)
            : {}
        )
      : [];

    if (!classId) {
      return jsonError("Class is required.", 400);
    }

    if (submittedStudents.length === 0) {
      return jsonError("At least one Young Learner is required.", 400);
    }

    if (submittedStudents.length > maxStudentsPerRequest) {
      return jsonError("A maximum of 12 Young Learners can be added at once.", 400);
    }

    const { data: classroom, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id, level_id, classroom_id, course_type, is_cambridge")
      .eq("id", classId)
      .single();

    if (classError || !classroom) {
      console.error(
        "Young Learner bulk class lookup failed:",
        formatError(classError)
      );
      return jsonError("Selected class was not found.", 404);
    }

    const { data: level, error: levelError } = await supabaseAdmin
      .from("levels")
      .select("id, name, catagory")
      .eq("id", classroom.level_id)
      .single();

    if (levelError || !level) {
      console.error(
        "Young Learner bulk level lookup failed:",
        formatError(levelError)
      );
      return jsonError("Unable to verify the selected class level.", 500);
    }

    if (classroom.is_cambridge === true) {
      return jsonError("The selected class is not valid for Young Learners.", 400);
    }

    const { data: assignedClassroom, error: classroomError } = classroom.classroom_id
      ? await supabaseAdmin
          .from("classrooms")
          .select("id, name")
          .eq("id", classroom.classroom_id)
          .maybeSingle()
      : { data: null, error: null };

    if (classroomError) {
      console.error(
        "Young Learner bulk classroom lookup failed:",
        formatError(classroomError)
      );
      return jsonError("Unable to verify the selected class.", 500);
    }

    const errors: RowError[] = [];
    const preparedStudents: PreparedStudent[] = submittedStudents.map((student, index) => {
      const row = getRowNumber(student?.row, index + 1);
      const firstName = normalizeRequiredString(student?.first_name);
      const lastName = normalizeRequiredString(student?.last_name);

      if (!firstName) {
        errors.push({
          row,
          field: "first_name",
          message: "First name is required.",
        });
      } else if (firstName.length > maxNameLength) {
        errors.push({
          row,
          field: "first_name",
          message: `First name must be ${maxNameLength} characters or fewer.`,
        });
      }

      if (!lastName) {
        errors.push({
          row,
          field: "last_name",
          message: "Last name is required.",
        });
      } else if (lastName.length > maxNameLength) {
        errors.push({
          row,
          field: "last_name",
          message: `Last name must be ${maxNameLength} characters or fewer.`,
        });
      }

      return {
        row,
        first_name: firstName,
        last_name: lastName,
        normalized_name: normalizeFullName(firstName, lastName),
      };
    });

    const rowsByName = preparedStudents.reduce<Record<string, number[]>>(
      (groups, student) => {
        if (!student.first_name || !student.last_name) {
          return groups;
        }

        return {
          ...groups,
          [student.normalized_name]: [
            ...(groups[student.normalized_name] || []),
            student.row,
          ],
        };
      },
      {}
    );

    Object.values(rowsByName)
      .filter((rows) => rows.length > 1)
      .flat()
      .forEach((row) => {
        errors.push({
          row,
          field: "student",
          message: "Duplicate name in this batch.",
        });
      });

    if (errors.length > 0) {
      const hasDuplicateErrors = errors.some(
        (error) => error.message === "Duplicate name in this batch."
      );
      const hasOnlyDuplicateErrors = errors.every(
        (error) => error.message === "Duplicate name in this batch."
      );

      return jsonValidationError(
        errors,
        hasDuplicateErrors && hasOnlyDuplicateErrors ? 409 : 400
      );
    }

    const { data: existingStudents, error: existingError } = await supabaseAdmin
      .from("young_learners")
      .select("first_name, last_name")
      .eq("class_id", classId)
      .eq("active", true);

    if (existingError) {
      console.error(
        "Young Learner bulk duplicate lookup failed:",
        formatError(existingError)
      );
      return jsonError("Unable to check existing Young Learners.", 500);
    }

    const existingStudentRows = (existingStudents || []) as Array<{
      first_name?: string | null;
      last_name?: string | null;
    }>;
    const existingNames = new Set(
      existingStudentRows.map((student) =>
        normalizeFullName(student.first_name || "", student.last_name || "")
      )
    );
    const existingDuplicateErrors = preparedStudents
      .filter((student) => existingNames.has(student.normalized_name))
      .map((student) => ({
        row: student.row,
        field: "student" as const,
        message: "A student with this name already exists in this class.",
      }));

    if (existingDuplicateErrors.length > 0) {
      return jsonValidationError(existingDuplicateErrors, 409);
    }

    const insertRows = preparedStudents.map((student) => ({
      first_name: student.first_name,
      last_name: student.last_name,
      class_id: classId,
      active: true,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("young_learners")
      .insert(insertRows);

    if (insertError) {
      console.error("Young Learner bulk insert failed:", formatError(insertError));
      return jsonError("Unable to create Young Learners.", 500);
    }

    return NextResponse.json({
      success: true,
      created_count: insertRows.length,
      class_id: classId,
      class_label: getClassLabel(
        classroom,
        level.name || "",
        assignedClassroom?.name || ""
      ),
    });
  } catch (error) {
    console.error("Young Learner bulk create route failed:", formatError(error));
    return jsonError("Unable to create Young Learners.", 500);
  }
}

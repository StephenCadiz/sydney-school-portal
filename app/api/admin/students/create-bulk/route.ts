import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const maxStudentsPerRequest = 12;
const maxNameLength = 80;
const maxEmailLength = 254;
const minimumPasswordLength = 6;
const cambridgeLevelNames = ["B1", "B2", "C1", "C2"];

type RowErrorField = "first_name" | "last_name" | "email" | "password" | "student";

type RowError = {
  row: number;
  field: RowErrorField;
  message: string;
};

type SubmittedStudent = {
  row?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  password?: unknown;
};

type PreparedStudent = {
  row: number;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  method: "invitation" | "manual";
};

type RowResult = {
  row: number;
  status: "created" | "failed";
  method: "invitation" | "manual";
  message?: string;
};

function normalizeLevelName(levelName: unknown) {
  return String(levelName || "").trim().toUpperCase();
}

function normalizeLevelCategory(category: unknown) {
  return String(category || "").trim().toLowerCase();
}

function isSupportLevel(levelName: unknown, category: unknown) {
  return (
    normalizeLevelCategory(category) === "support" ||
    normalizeLevelName(levelName) === "SUPPORT CLASSES"
  );
}

function normalizeRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getSubmittedPassword(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getRowNumber(value: unknown, fallback: number) {
  const row = Number(value);

  return Number.isInteger(row) && row >= 1 && row <= maxStudentsPerRequest
    ? row
    : fallback;
}

function formatError(error: unknown) {
  if (!error) {
    return "Unknown error from Supabase/Auth.";
  }

  if (typeof error === "object") {
    const errorObject = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      status?: unknown;
    };
    const parts = [
      errorObject.message ? `Message: ${String(errorObject.message)}` : "",
      errorObject.details ? `Details: ${String(errorObject.details)}` : "",
      errorObject.hint ? `Hint: ${String(errorObject.hint)}` : "",
      errorObject.code ? `Code: ${String(errorObject.code)}` : "",
      errorObject.status ? `Status: ${String(errorObject.status)}` : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  const fallback = String(error);
  return fallback && fallback !== "[object Object]"
    ? fallback
    : "Unknown error from Supabase/Auth.";
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

function getInviteRedirectUrl() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  return `${siteUrl.replace(/\/$/, "")}/set-password`;
}

function isExistingAccountError(error: unknown) {
  const text = formatError(error).toLowerCase();
  return (
    text.includes("already") ||
    text.includes("registered") ||
    text.includes("exists") ||
    text.includes("duplicate")
  );
}

function isRateLimitError(error: unknown) {
  const text = formatError(error).toLowerCase();
  return (
    text.includes("rate limit") ||
    text.includes("too many") ||
    text.includes("429")
  );
}

function isInvalidEmailError(error: unknown) {
  const text = formatError(error).toLowerCase();
  return text.includes("invalid email") || text.includes("email address");
}

function getAuthFailureMessage(error: unknown, method: "invitation" | "manual") {
  if (isExistingAccountError(error)) {
    return "An account with this email already exists.";
  }

  if (method === "invitation" && isRateLimitError(error)) {
    return "Invitation email limit reached. Try this student again later.";
  }

  if (isInvalidEmailError(error)) {
    return "Enter a valid email address.";
  }

  return "Unable to create this student account.";
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
    console.error("Bulk student create auth failed:", formatError(userError));
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
      "Bulk student create admin lookup failed:",
      formatError(profileError)
    );
    return {
      error: jsonError("Unable to verify admin user.", 500),
    };
  }

  if (profile?.role !== "admin") {
    return {
      error: jsonError("Only admins can create students.", 403),
    };
  }

  return { user };
}

async function validateCambridgeClass(classId: string) {
  const { data: classroom, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id, level_id, is_cambridge")
    .eq("id", classId)
    .single();

  if (classError || !classroom) {
    console.error("Bulk student class lookup failed:", formatError(classError));
    return {
      error: jsonError("Selected class was not found.", 404),
    };
  }

  const { data: level, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("name, catagory")
    .eq("id", classroom.level_id)
    .single();

  if (levelError || !level?.name) {
    console.error("Bulk student level lookup failed:", formatError(levelError));
    return {
      error: jsonError("Unable to verify selected class level.", 500),
    };
  }

  if (
    classroom.is_cambridge !== true ||
    isSupportLevel(level.name, level.catagory) ||
    !cambridgeLevelNames.includes(normalizeLevelName(level.name))
  ) {
    return {
      error: jsonError("Selected class is not a Cambridge class.", 400),
    };
  }

  return {
    classroom,
    level,
  };
}

function validateSubmittedStudents(submittedStudents: SubmittedStudent[]) {
  const errors: RowError[] = [];
  const preparedStudents: PreparedStudent[] = submittedStudents.map(
    (student, index) => {
      const row = getRowNumber(student.row, index + 1);
      const firstName = normalizeRequiredString(student.first_name);
      const lastName = normalizeRequiredString(student.last_name);
      const email = normalizeEmail(student.email);
      const password = getSubmittedPassword(student.password);
      const passwordHasText = password.length > 0;

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

      if (!email) {
        errors.push({
          row,
          field: "email",
          message: "Email is required.",
        });
      } else if (email.length > maxEmailLength || !isValidEmail(email)) {
        errors.push({
          row,
          field: "email",
          message: "Enter a valid email address.",
        });
      }

      if (typeof student.email === "string" && /\s/.test(student.email.trim())) {
        errors.push({
          row,
          field: "email",
          message: "Email cannot contain spaces.",
        });
      }

      if (passwordHasText && !password.trim()) {
        errors.push({
          row,
          field: "password",
          message: "Enter a valid password or clear the field completely.",
        });
      } else if (passwordHasText && password.length < minimumPasswordLength) {
        errors.push({
          row,
          field: "password",
          message: "Password must be at least 6 characters.",
        });
      }

      return {
        row,
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        method: passwordHasText ? "manual" : "invitation",
      };
    }
  );

  const rowsByEmail = preparedStudents.reduce<Record<string, number[]>>(
    (groups, student) => {
      if (!student.email) {
        return groups;
      }

      return {
        ...groups,
        [student.email]: [...(groups[student.email] || []), student.row],
      };
    },
    {}
  );

  Object.values(rowsByEmail)
    .filter((duplicateRows) => duplicateRows.length > 1)
    .flat()
    .forEach((row) => {
      errors.push({
        row,
        field: "email",
        message: "Duplicate email address in this batch.",
      });
    });

  return {
    errors,
    preparedStudents,
  };
}

async function findExistingProfileEmails(emails: string[]) {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("email");

  if (error) {
    console.error("Bulk student existing profile lookup failed:", formatError(error));
    throw new Error("Unable to check existing users.");
  }

  const requestedEmails = new Set(emails);
  return new Set(
    (profiles || [])
      .map((profile) => normalizeEmail(profile.email))
      .filter((email) => requestedEmails.has(email))
  );
}

async function cleanupCreatedStudent(studentId: string) {
  const { error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .delete()
    .eq("student_id", studentId);

  if (enrolmentError) {
    console.error("Bulk student enrolment cleanup failed:", formatError(enrolmentError));
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", studentId)
    .eq("role", "student");

  if (profileError) {
    console.error("Bulk student profile cleanup failed:", formatError(profileError));
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(studentId);

  if (authError) {
    console.error("Bulk student Auth cleanup failed:", formatError(authError));
  }
}

async function setupStudentRecords(
  student: PreparedStudent,
  studentId: string,
  classId: string
) {
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: studentId,
      email: student.email,
      first_name: student.first_name,
      last_name: student.last_name,
      role: "student",
    });

  if (profileError) {
    throw new Error("profile");
  }

  const { error: enrolmentError } = await supabaseAdmin
    .from("class_enrolments")
    .insert([
      {
        student_id: studentId,
        class_id: classId,
      },
    ]);

  if (enrolmentError) {
    throw new Error("enrolment");
  }
}

async function createStudentAccount(student: PreparedStudent, classId: string) {
  if (student.method === "invitation") {
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      student.email,
      {
        redirectTo: getInviteRedirectUrl(),
      }
    );

    if (error || !data.user) {
      return {
        error,
      };
    }

    try {
      await setupStudentRecords(student, data.user.id, classId);
    } catch (setupError) {
      console.error(
        "Bulk invited student setup failed:",
        formatError(setupError)
      );
      await cleanupCreatedStudent(data.user.id);
      return {
        setupFailed: true,
      };
    }

    return {
      studentId: data.user.id,
    };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: student.email,
    password: student.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    return {
      error,
    };
  }

  try {
    await setupStudentRecords(student, data.user.id, classId);
  } catch (setupError) {
    console.error("Bulk manual student setup failed:", formatError(setupError));
    await cleanupCreatedStudent(data.user.id);
    return {
      setupFailed: true,
    };
  }

  return {
    studentId: data.user.id,
  };
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
      return jsonError("At least one Cambridge student is required.", 400);
    }

    if (submittedStudents.length > maxStudentsPerRequest) {
      return jsonError(
        "A maximum of 12 Cambridge students can be added at once.",
        400
      );
    }

    const classValidation = await validateCambridgeClass(classId);

    if (classValidation.error) {
      return classValidation.error;
    }

    const { errors, preparedStudents } =
      validateSubmittedStudents(submittedStudents);

    if (errors.length > 0) {
      const conflictOnly = errors.every((error) =>
        error.message.includes("Duplicate email")
      );
      return jsonValidationError(errors, conflictOnly ? 409 : 400);
    }

    const existingEmails = await findExistingProfileEmails(
      preparedStudents.map((student) => student.email)
    );
    const existingErrors = preparedStudents
      .filter((student) => existingEmails.has(student.email))
      .map((student) => ({
        row: student.row,
        field: "email" as const,
        message: "An account with this email already exists.",
      }));

    if (existingErrors.length > 0) {
      return jsonValidationError(existingErrors, 409);
    }

    const results: RowResult[] = [];
    let invitationRateLimited = false;

    for (const student of preparedStudents) {
      if (student.method === "invitation" && invitationRateLimited) {
        results.push({
          row: student.row,
          status: "failed",
          method: student.method,
          message: "Invitation email limit reached. Try this student again later.",
        });
        continue;
      }

      const creationResult = await createStudentAccount(student, classId);

      if (creationResult.setupFailed) {
        results.push({
          row: student.row,
          status: "failed",
          method: student.method,
          message: "Student account setup failed. Please try again.",
        });
        continue;
      }

      if (creationResult.error || !creationResult.studentId) {
        const message = getAuthFailureMessage(
          creationResult.error,
          student.method
        );

        if (
          student.method === "invitation" &&
          message === "Invitation email limit reached. Try this student again later."
        ) {
          invitationRateLimited = true;
        }

        console.error(
          "Bulk student Auth create failed:",
          formatError(creationResult.error)
        );

        results.push({
          row: student.row,
          status: "failed",
          method: student.method,
          message,
        });
        continue;
      }

      results.push({
        row: student.row,
        status: "created",
        method: student.method,
      });
    }

    const createdResults = results.filter((result) => result.status === "created");
    const failedResults = results.filter((result) => result.status === "failed");
    const invitedCount = createdResults.filter(
      (result) => result.method === "invitation"
    ).length;
    const manualCount = createdResults.filter(
      (result) => result.method === "manual"
    ).length;

    return NextResponse.json({
      success: failedResults.length === 0,
      created_count: createdResults.length,
      invited_count: invitedCount,
      manual_count: manualCount,
      failed_count: failedResults.length,
      results,
    });
  } catch (error) {
    console.error("Bulk student create route failed:", formatError(error));
    return jsonError("Unable to create Cambridge students.", 500);
  }
}

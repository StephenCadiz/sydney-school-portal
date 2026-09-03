import "server-only";

import { NextRequest } from "next/server";

import { supabaseAdmin } from "./supabaseAdmin";

export type TestStudentIdentity = {
  student_id: string;
  student_type: "profile" | "young_learner";
};

export type TestStudentPurgePreview = {
  students: {
    profile: number;
    young_learner: number;
    total: number;
    auth_users: number;
  };
  dependencies: Record<string, number>;
  total_dependent_rows: number;
  warnings: string[];
  preserved: string[];
  success?: boolean;
};

export class TestStudentPurgeRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TestStudentPurgeRequestError";
    this.status = status;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTestStudentSelection(
  value: unknown
): TestStudentIdentity[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    throw new TestStudentPurgeRequestError(
      "Select between 1 and 500 test students."
    );
  }

  const identities = value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new TestStudentPurgeRequestError(
        "The selected student list is invalid."
      );
    }

    const studentId = String((item as Record<string, unknown>).student_id || "");
    const studentType = (item as Record<string, unknown>).student_type;

    if (
      !uuidPattern.test(studentId) ||
      (studentType !== "profile" && studentType !== "young_learner")
    ) {
      throw new TestStudentPurgeRequestError(
        "Every selected student must have a valid type and ID."
      );
    }

    return {
      student_id: studentId,
      student_type: studentType,
    } satisfies TestStudentIdentity;
  });

  const uniqueKeys = new Set(
    identities.map(
      (identity) => `${identity.student_type}:${identity.student_id}`
    )
  );

  if (uniqueKeys.size !== identities.length) {
    throw new TestStudentPurgeRequestError(
      "The selected student list contains duplicates."
    );
  }

  return identities;
}

export async function requireTestStudentPurgeAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    throw new TestStudentPurgeRequestError(
      "You must be logged in as an admin.",
      401
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    console.error("Test student purge token verification failed:", userError);
    throw new TestStudentPurgeRequestError(
      "Your admin session is invalid or has expired.",
      401
    );
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Test student purge admin lookup failed:", profileError);
    throw new TestStudentPurgeRequestError(
      "Unable to verify the admin account.",
      500
    );
  }

  if (profile?.role !== "admin") {
    throw new TestStudentPurgeRequestError(
      "Only admins can purge test students.",
      403
    );
  }

  return user.id;
}

export function isSelectionValidationError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "22023" ||
    String(error.message || "").includes("selected profile") ||
    String(error.message || "").includes("selected Young Learner")
  );
}

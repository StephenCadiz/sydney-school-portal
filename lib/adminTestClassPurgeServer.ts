import "server-only";

import { NextRequest } from "next/server";

import { supabaseAdmin } from "./supabaseAdmin";

export type TestClassPurgePreview = {
  students: {
    cambridge_current: number;
    young_learners_current: number;
    total_current: number;
  };
  dependencies: Record<string, number>;
  total_dependent_rows: number;
  storage_files: number;
  can_purge: boolean;
  warnings: string[];
  preserved: string[];
  success?: boolean;
};

export class TestClassPurgeRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TestClassPurgeRequestError";
    this.status = status;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTestClassId(value: unknown) {
  const classId = String(value || "").trim();

  if (!uuidPattern.test(classId)) {
    throw new TestClassPurgeRequestError("Choose a valid class.");
  }

  return classId;
}

export async function requireTestClassPurgeAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    throw new TestClassPurgeRequestError(
      "You must be logged in as an admin.",
      401
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    console.error("Test class purge token verification failed:", userError);
    throw new TestClassPurgeRequestError(
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
    console.error("Test class purge admin lookup failed:", profileError);
    throw new TestClassPurgeRequestError(
      "Unable to verify the admin account.",
      500
    );
  }

  if (profile?.role !== "admin") {
    throw new TestClassPurgeRequestError(
      "Only admins can purge test classes.",
      403
    );
  }

  return user.id;
}

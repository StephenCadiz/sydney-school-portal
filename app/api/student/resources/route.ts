import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { resolveStudentCurrentClassServer } from "../../../../lib/academicYearsServer";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function logFailure(stage: string, error: unknown) {
  console.error("Student class resources load failed:", { stage, error });
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return jsonError("Authentication required.", 401);

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    logFailure("authentication", authError);
    return jsonError("Authentication required.", 401);
  }

  const studentId = authData.user.id;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", studentId)
    .maybeSingle();
  if (profileError) {
    logFailure("profile", profileError);
    return jsonError("Unable to verify student access.", 500);
  }
  if (profile?.role !== "student") {
    return jsonError("Student access required.", 403);
  }

  let classResolution;
  try {
    classResolution = await resolveStudentCurrentClassServer(studentId);
  } catch (error) {
    logFailure("current-class", error);
    return jsonError("Unable to load class resources.", 500);
  }

  if (classResolution.error || !classResolution.classroom) {
    return jsonError(
      classResolution.error || "No current class is available.",
      classResolution.error?.startsWith("More than one") ? 409 : 404
    );
  }

  const classId = String(classResolution.classroom.id || "");
  if (!classId) return jsonError("Unable to load class resources.", 500);

  const { data: resources, error: resourceError } = await supabaseAdmin
    .from("resources")
    .select("id, title, description, resource_url")
    .eq("class_id", classId)
    .eq("active", true)
    .order("id", { ascending: true });
  if (resourceError) {
    logFailure("resource-load", resourceError);
    return jsonError("Unable to load class resources.", 500);
  }

  return NextResponse.json(
    { resources: resources || [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

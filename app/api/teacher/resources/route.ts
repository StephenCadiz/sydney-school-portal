import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function formatError(error: unknown) {
  if (!error || typeof error !== "object") return String(error || "Unknown error.");

  const value = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  return (
    [value.message, value.details, value.hint, value.code]
      .filter(Boolean)
      .join(" | ") || "Unknown error."
  );
}

async function authenticateTeacher(request: NextRequest) {
  const token = bearerToken(request);

  if (!token) {
    return {
      teacherId: "",
      errorResponse: jsonError("Authentication required.", 401),
    };
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);

  if (authError || !authData.user) {
    console.error(
      "General teacher resources authentication failed:",
      formatError(authError)
    );
    return {
      teacherId: "",
      errorResponse: jsonError("Authentication required.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "General teacher resources profile lookup failed:",
      formatError(profileError)
    );
    return {
      teacherId: "",
      errorResponse: jsonError("Unable to verify Teacher access.", 500),
    };
  }

  if (profile?.role !== "teacher") {
    return {
      teacherId: "",
      errorResponse: jsonError("Teacher access required.", 403),
    };
  }

  return { teacherId: authData.user.id, errorResponse: null };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateTeacher(request);

  if (auth.errorResponse) return auth.errorResponse;

  const { data, error } = await supabaseAdmin
    .from("teacher_resources")
    .select(
      "id, title, description, external_url, storage_path, original_filename, mime_type, file_size, created_at, updated_at"
    )
    .eq("resource_scope", "general_teacher")
    .is("level_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "General teacher resources load failed:",
      formatError(error)
    );
    return jsonError("General Teacher Resources could not be loaded.", 500);
  }

  const resources = (data || []).map((resource) => ({
    id: String(resource.id),
    title: resource.title,
    description: resource.description,
    resource_scope: "general_teacher" as const,
    level_id: null,
    created_by: null,
    external_url: resource.external_url,
    storage_path: null,
    has_private_file: Boolean(resource.storage_path),
    original_filename: resource.original_filename,
    mime_type: resource.mime_type,
    file_size: resource.file_size,
    created_at: resource.created_at,
    updated_at: resource.updated_at,
  }));

  return NextResponse.json(
    { resources },
    { headers: { "Cache-Control": "no-store" } }
  );
}

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const teacherResourcesBucket = "teacher-resources";
const signedUrlExpiresInSeconds = 120;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function formatError(error: any) {
  if (!error) {
    return "Unknown error.";
  }

  return [
    error.message ? `Message: ${error.message}` : "",
    error.details ? `Details: ${error.details}` : "",
    error.hint ? `Hint: ${error.hint}` : "",
    error.code ? `Code: ${error.code}` : "",
  ]
    .filter(Boolean)
    .join("\n") || String(error);
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.replace("Bearer ", "")
    : "";
}

async function getAuthenticatedUser(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      user: null,
      errorResponse: jsonError("Missing authorization token.", 401),
    };
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    console.error("Open teacher resource auth failed:", formatError(error));

    return {
      user: null,
      errorResponse: jsonError("Invalid authorization token.", 401),
    };
  }

  return {
    user,
    errorResponse: null,
  };
}

async function teacherCanAccessLevel(userId: string, levelId: number) {
  const { data, error } = await supabaseAdmin
    .from("classes")
    .select("id")
    .eq("teacher_id", userId)
    .eq("level_id", levelId)
    .limit(1);

  if (error) {
    console.error("Teacher resource open level check failed:", formatError(error));
    throw new Error("Unable to verify level access.");
  }

  return Boolean(data && data.length > 0);
}

export async function POST(request: NextRequest) {
  try {
    const { user, errorResponse } = await getAuthenticatedUser(request);

    if (errorResponse || !user) {
      return errorResponse;
    }

    const body = await request.json().catch(() => ({}));
    const resourceId = String(body.resourceId || "").trim();

    if (!resourceId) {
      return jsonError("Resource ID is required.", 400);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.role) {
      console.error("Open teacher resource profile lookup failed:", formatError(profileError));
      return jsonError("Unable to verify user profile.", 500);
    }

    if (profile.role !== "teacher" && profile.role !== "admin") {
      return jsonError("You do not have access to this resource.", 403);
    }

    const { data: resource, error: resourceError } = await supabaseAdmin
      .from("teacher_resources")
      .select("id, level_id, external_url, storage_path")
      .eq("id", resourceId)
      .single();

    if (resourceError || !resource) {
      console.error("Open teacher resource lookup failed:", formatError(resourceError));
      return jsonError("Resource was not found.", 404);
    }

    if (profile.role !== "admin") {
      const hasLevelAccess = await teacherCanAccessLevel(
        user.id,
        Number(resource.level_id)
      );

      if (!hasLevelAccess) {
        return jsonError("You do not have access to this resource.", 403);
      }
    }

    if (!resource.storage_path) {
      return jsonError("This resource is an external link.", 400);
    }

    const { data, error: signedUrlError } = await supabaseAdmin.storage
      .from(teacherResourcesBucket)
      .createSignedUrl(resource.storage_path, signedUrlExpiresInSeconds);

    if (signedUrlError || !data?.signedUrl) {
      console.error(
        "Teacher resource signed URL creation failed:",
        formatError(signedUrlError)
      );
      return jsonError("Unable to open resource file.", 500);
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      expiresIn: signedUrlExpiresInSeconds,
    });
  } catch (error) {
    console.error("Teacher resource open route failed:", formatError(error));
    return jsonError("Unable to open resource file.", 500);
  }
}

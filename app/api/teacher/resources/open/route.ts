import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { isTeacherResourceScope } from "../../../../../lib/teacherResourceValidation";

const teacherResourcesBucket = "teacher-resources";
const signedUrlExpiresInSeconds = 120;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function formatError(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error || "Unknown error.");
  }

  const value = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  return [
    value.message ? `Message: ${value.message}` : "",
    value.details ? `Details: ${value.details}` : "",
    value.hint ? `Hint: ${value.hint}` : "",
    value.code ? `Code: ${value.code}` : "",
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
      .select("id, resource_scope, level_id, external_url, storage_path")
      .eq("id", resourceId)
      .single();

    if (resourceError || !resource) {
      console.error("Open teacher resource lookup failed:", formatError(resourceError));
      return jsonError("Resource was not found.", 404);
    }

    if (!isTeacherResourceScope(resource.resource_scope)) {
      return jsonError("You do not have access to this resource.", 403);
    }

    if (profile.role !== "admin") {
      if (resource.resource_scope === "general_teacher") {
        if (resource.level_id !== null) {
          return jsonError("You do not have access to this resource.", 403);
        }
      } else {
        const levelId = Number(resource.level_id);

        if (!Number.isFinite(levelId) || levelId <= 0) {
          return jsonError("You do not have access to this resource.", 403);
        }

        const hasLevelAccess = await teacherCanAccessLevel(user.id, levelId);

        if (!hasLevelAccess) {
          return jsonError("You do not have access to this resource.", 403);
        }
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

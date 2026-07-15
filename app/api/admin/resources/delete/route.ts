import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const teacherResourcesBucket = "teacher-resources";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function formatError(error: any) {
  if (!error) {
    return "Unknown error.";
  }

  return (
    [
      error.message ? `Message: ${error.message}` : "",
      error.details ? `Details: ${error.details}` : "",
      error.hint ? `Hint: ${error.hint}` : "",
      error.code ? `Code: ${error.code}` : "",
    ]
      .filter(Boolean)
      .join("\n") || String(error)
  );
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
    console.error("Admin resource delete auth failed:", formatError(error));

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

async function verifyAdmin(userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error || !profile?.role) {
    console.error("Admin resource delete profile lookup failed:", formatError(error));
    return {
      allowed: false,
      response: jsonError("Unable to verify admin user.", 500),
    };
  }

  if (profile.role !== "admin") {
    return {
      allowed: false,
      response: jsonError("Only admins can delete teacher resources.", 403),
    };
  }

  return {
    allowed: true,
    response: null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { user, errorResponse } = await getAuthenticatedUser(request);

    if (errorResponse || !user) {
      return errorResponse;
    }

    const adminCheck = await verifyAdmin(user.id);

    if (!adminCheck.allowed) {
      return adminCheck.response || jsonError("Unable to verify admin user.", 500);
    }

    const body = await request.json().catch(() => ({}));
    const resourceId = String(body.resourceId || "").trim();

    if (!resourceId) {
      return jsonError("Resource ID is required.", 400);
    }

    const { data: resource, error: resourceError } = await supabaseAdmin
      .from("teacher_resources")
      .select("id, resource_scope, storage_path")
      .eq("id", resourceId)
      .single();

    if (resourceError || !resource) {
      console.error("Admin resource delete lookup failed:", formatError(resourceError));
      return jsonError("Resource was not found.", 404);
    }

    if (
      resource.resource_scope !== "shared_teacher" &&
      resource.resource_scope !== "official_teacher"
    ) {
      return jsonError("This resource type cannot be deleted here.", 400);
    }

    const { error: deleteError } = await supabaseAdmin
      .from("teacher_resources")
      .delete()
      .eq("id", resourceId);

    if (deleteError) {
      console.error("Admin resource database delete failed:", formatError(deleteError));
      return jsonError("Unable to delete resource.", 500);
    }

    if (!resource.storage_path) {
      return NextResponse.json({ success: true });
    }

    const { error: storageError } = await supabaseAdmin.storage
      .from(teacherResourcesBucket)
      .remove([resource.storage_path]);

    if (storageError) {
      console.error("Admin resource storage cleanup failed:", formatError(storageError));

      return NextResponse.json({
        success: true,
        storageCleanupFailed: true,
        message:
          "Resource was deleted, but the private file could not be removed automatically.",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin resource delete route failed:", formatError(error));
    return jsonError("Unable to delete resource.", 500);
  }
}

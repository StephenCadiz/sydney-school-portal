import { NextRequest, NextResponse } from "next/server";

import { isEligibleCambridgeExamLevel } from "../../../../../lib/cambridgeExamBank";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  validateTeacherResourceDescription,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceLevelId,
  validateTeacherResourceTitle,
} from "../../../../../lib/teacherResourceValidation";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function formatError(error: any) {
  if (!error) return "Unknown error.";

  return (
    [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(" | ") || String(error)
  );
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function requireAdmin(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return { userId: "", response: jsonError("Authentication required.", 401) };

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    console.error("Admin resource update auth failed:", formatError(authError));
    return { userId: "", response: jsonError("Authentication required.", 401) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error(
      "Admin resource update profile lookup failed:",
      formatError(profileError)
    );
    return {
      userId: "",
      response: jsonError("Unable to verify admin access.", 500),
    };
  }
  if (profile?.role !== "admin") {
    return { userId: "", response: jsonError("Admin access required.", 403) };
  }

  return { userId: authData.user.id, response: null };
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (admin.response) return admin.response;

    const body = await request.json().catch(() => ({}));
    const resourceId = String(body.resourceId || "").trim();
    const levelValidation = validateTeacherResourceLevelId(body.levelId);
    const titleValidation = validateTeacherResourceTitle(body.title);
    const descriptionValidation = validateTeacherResourceDescription(
      body.description
    );
    const firstError =
      (!uuidPattern.test(resourceId) ? "Invalid resource ID." : "") ||
      levelValidation.error ||
      titleValidation.error ||
      descriptionValidation.error;

    if (firstError) return jsonError(firstError, 400);

    if (
      [
        "classId",
        "class_id",
        "courseType",
        "course_type",
        "academicYearId",
        "academic_year_id",
      ].some((field) => String(body[field] || "").trim())
    ) {
      return jsonError(
        "Cambridge Student Resources must target one whole Cambridge level.",
        400
      );
    }

    const { data: level, error: levelError } = await supabaseAdmin
      .from("levels")
      .select("id, name")
      .eq("id", levelValidation.value)
      .maybeSingle();
    if (levelError) {
      console.error("Admin resource update level lookup failed:", formatError(levelError));
      return jsonError("Unable to verify the selected level.", 500);
    }
    if (!level || !isEligibleCambridgeExamLevel(level.name)) {
      return jsonError(
        "Cambridge Student Resources can only target B1, B2, C1 or C2.",
        400
      );
    }

    const { data: resource, error: resourceError } = await supabaseAdmin
      .from("teacher_resources")
      .select("id, resource_scope, external_url, storage_path")
      .eq("id", resourceId)
      .eq("resource_scope", "cambridge_student")
      .maybeSingle();
    if (resourceError) {
      console.error("Admin resource update lookup failed:", formatError(resourceError));
      return jsonError("Unable to load resource.", 500);
    }
    if (!resource) return jsonError("Resource was not found.", 404);

    const updates: Record<string, string | number | null> = {
      level_id: levelValidation.value,
      title: titleValidation.value,
      description: descriptionValidation.value,
    };

    if (resource.external_url) {
      const urlValidation = validateTeacherResourceExternalUrl(body.externalUrl);
      if (urlValidation.error) return jsonError(urlValidation.error, 400);
      updates.external_url = urlValidation.value;
    } else if (!resource.storage_path) {
      return jsonError("Resource source is not available.", 409);
    }

    const { error: updateError } = await supabaseAdmin
      .from("teacher_resources")
      .update(updates)
      .eq("id", resource.id)
      .eq("resource_scope", "cambridge_student");
    if (updateError) {
      console.error("Admin resource update failed:", formatError(updateError));
      return jsonError("Unable to update resource.", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin resource update route failed:", formatError(error));
    return jsonError("Unable to update resource.", 500);
  }
}

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { isEligibleCambridgeExamLevel } from "../../../../../lib/cambridgeExamBank";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  isAdminManagedTeacherResourceScope,
  sanitizeTeacherResourceFilename,
  validateTeacherResourceDescription,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceFile,
  validateTeacherResourceLevelForScope,
  validateTeacherResourceScope,
  validateTeacherResourceTitle,
  validateTeacherResourceType,
  type AdminManagedTeacherResourceScope,
} from "../../../../../lib/teacherResourceValidation";

const teacherResourcesBucket = "teacher-resources";

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

  return (
    [
      value.message ? `Message: ${value.message}` : "",
      value.details ? `Details: ${value.details}` : "",
      value.hint ? `Hint: ${value.hint}` : "",
      value.code ? `Code: ${value.code}` : "",
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
    console.error("Admin resource auth failed:", formatError(error));

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
    console.error("Admin resource profile lookup failed:", formatError(error));
    return {
      allowed: false,
      response: jsonError("Unable to verify admin user.", 500),
    };
  }

  if (profile.role !== "admin") {
    return {
      allowed: false,
      response: jsonError("Only admins can manage official resources.", 403),
    };
  }

  return {
    allowed: true,
    response: null,
  };
}

async function verifyLevel(levelId: number) {
  const { data: level, error } = await supabaseAdmin
    .from("levels")
    .select("id, name")
    .eq("id", levelId)
    .single();

  if (error || !level) {
    console.error("Admin resource level lookup failed:", formatError(error));
    return null;
  }

  return level;
}

function getResourceLabel(scope: AdminManagedTeacherResourceScope) {
  if (scope === "cambridge_student") {
    return "Cambridge Student Resource";
  }

  return scope === "general_teacher"
    ? "General Teacher Resource"
    : "Official Resource";
}

export async function POST(request: NextRequest) {
  let uploadedStoragePath = "";

  try {
    const { user, errorResponse } = await getAuthenticatedUser(request);

    if (errorResponse || !user) {
      return errorResponse;
    }

    const adminCheck = await verifyAdmin(user.id);

    if (!adminCheck.allowed) {
      return adminCheck.response || jsonError("Unable to verify admin user.", 500);
    }

    const formData = await request.formData();
    const scopeValidation = validateTeacherResourceScope(
      formData.get("resourceScope") || "official_teacher"
    );
    const resourceScope =
      scopeValidation.value &&
      isAdminManagedTeacherResourceScope(scopeValidation.value)
        ? scopeValidation.value
        : null;
    const levelValidation = resourceScope
      ? validateTeacherResourceLevelForScope(
          resourceScope,
          formData.get("levelId")
        )
      : { value: null, error: "" };
    const titleValidation = validateTeacherResourceTitle(formData.get("title"));
    const descriptionValidation = validateTeacherResourceDescription(
      formData.get("description")
    );
    const typeValidation = validateTeacherResourceType(formData.get("resourceType"));

    const firstValidationError =
      scopeValidation.error ||
      (!resourceScope ? "Invalid resource destination." : "") ||
      levelValidation.error ||
      titleValidation.error ||
      descriptionValidation.error ||
      typeValidation.error;

    if (firstValidationError) {
      return jsonError(firstValidationError, 400);
    }

    if (!resourceScope) {
      return jsonError("Invalid resource destination.", 400);
    }

    const levelId = levelValidation.value;
    const level = levelId === null ? null : await verifyLevel(levelId);

    if (levelId !== null && !level) {
      return jsonError("Selected level was not found.", 404);
    }

    if (
      resourceScope === "cambridge_student" &&
      (!level || !isEligibleCambridgeExamLevel(level.name))
    ) {
      return jsonError(
        "Cambridge Student Resources can only target B1, B2, C1 or C2.",
        400
      );
    }

    if (
      resourceScope === "cambridge_student" &&
      [
        "classId",
        "class_id",
        "courseType",
        "course_type",
        "academicYearId",
        "academic_year_id",
      ].some((field) => String(formData.get(field) || "").trim())
    ) {
      return jsonError(
        "Cambridge Student Resources must target one whole Cambridge level.",
        400
      );
    }

    const resourceLabel = getResourceLabel(resourceScope);

    if (typeValidation.value === "link") {
      const fileEntry = formData.get("file");

      if (fileEntry instanceof File && fileEntry.size > 0) {
        return jsonError("Choose either a file or an external link, not both.", 400);
      }

      const urlValidation = validateTeacherResourceExternalUrl(
        formData.get("externalUrl")
      );

      if (urlValidation.error) {
        return jsonError(urlValidation.error, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("teacher_resources")
        .insert([
          {
            title: titleValidation.value,
            description: descriptionValidation.value,
            resource_scope: resourceScope,
            level_id: levelId,
            created_by: user.id,
            external_url: urlValidation.value,
            storage_path: null,
            original_filename: null,
            mime_type: null,
            file_size: null,
          },
        ])
        .select("id")
        .single();

      if (error) {
        console.error("Admin resource link insert failed:", formatError(error));
        return jsonError(`Unable to publish ${resourceLabel}.`, 500);
      }

      return NextResponse.json({ success: true, resourceId: data.id });
    }

    const externalUrl = String(formData.get("externalUrl") || "").trim();

    if (externalUrl) {
      return jsonError("Choose either a file or an external link, not both.", 400);
    }

    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return jsonError("Please choose a file to upload.", 400);
    }

    const fileValidation = validateTeacherResourceFile({
      name: fileEntry.name,
      type: fileEntry.type,
      size: fileEntry.size,
    });

    if (fileValidation.error) {
      return jsonError(fileValidation.error, 400);
    }

    const safeFilename = sanitizeTeacherResourceFilename(fileEntry.name);
    const storageFolder =
      resourceScope === "cambridge_student"
        ? "cambridge-student"
        : resourceScope === "general_teacher"
          ? "general-teacher"
          : "official";
    uploadedStoragePath = [
      storageFolder,
      levelId === null ? null : String(levelId),
      `${randomUUID()}-${safeFilename}`,
    ]
      .filter(Boolean)
      .join("/");
    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(teacherResourcesBucket)
      .upload(uploadedStoragePath, fileBuffer, {
        contentType: fileEntry.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Admin resource upload failed:", formatError(uploadError));
      return jsonError(`Unable to upload ${resourceLabel} file.`, 500);
    }

    const { data, error: insertError } = await supabaseAdmin
      .from("teacher_resources")
      .insert([
        {
          title: titleValidation.value,
          description: descriptionValidation.value,
          resource_scope: resourceScope,
          level_id: levelId,
          created_by: user.id,
          external_url: null,
          storage_path: uploadedStoragePath,
          original_filename: fileEntry.name,
          mime_type: fileEntry.type,
          file_size: fileEntry.size,
        },
      ])
      .select("id")
      .single();

    if (insertError) {
      console.error("Admin resource file insert failed:", formatError(insertError));

      const { error: cleanupError } = await supabaseAdmin.storage
        .from(teacherResourcesBucket)
        .remove([uploadedStoragePath]);

      if (cleanupError) {
        console.error("Admin resource orphan file cleanup failed:", formatError(cleanupError));
      }

      return jsonError(`Unable to publish ${resourceLabel}.`, 500);
    }

    return NextResponse.json({ success: true, resourceId: data.id });
  } catch (error) {
    console.error("Admin resource create route failed:", formatError(error));

    if (uploadedStoragePath) {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from(teacherResourcesBucket)
        .remove([uploadedStoragePath]);

      if (cleanupError) {
        console.error("Admin resource unexpected cleanup failed:", formatError(cleanupError));
      }
    }

    return jsonError("Unable to publish resource.", 500);
  }
}

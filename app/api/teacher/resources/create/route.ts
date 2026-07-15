import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  sanitizeTeacherResourceFilename,
  validateTeacherResourceDescription,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceFile,
  validateTeacherResourceLevelId,
  validateTeacherResourceTitle,
  validateTeacherResourceType,
} from "../../../../../lib/teacherResourceValidation";

const teacherResourcesBucket = "teacher-resources";

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
    console.error("Teacher resource auth failed:", formatError(error));

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

async function verifyLevelAccess(userId: string, role: string, levelId: number) {
  const { data: level, error: levelError } = await supabaseAdmin
    .from("levels")
    .select("id")
    .eq("id", levelId)
    .single();

  if (levelError || !level) {
    console.error("Teacher resource level lookup failed:", formatError(levelError));
    return {
      allowed: false,
      response: jsonError("Selected level was not found.", 404),
    };
  }

  if (role === "admin") {
    return {
      allowed: true,
      response: null,
    };
  }

  if (role !== "teacher") {
    return {
      allowed: false,
      response: jsonError("Only teachers can publish shared resources.", 403),
    };
  }

  const { data: classes, error: classError } = await supabaseAdmin
    .from("classes")
    .select("id")
    .eq("teacher_id", userId)
    .eq("level_id", levelId)
    .limit(1);

  if (classError) {
    console.error(
      "Teacher resource class access lookup failed:",
      formatError(classError)
    );
    return {
      allowed: false,
      response: jsonError("Unable to verify level access.", 500),
    };
  }

  if (!classes || classes.length === 0) {
    return {
      allowed: false,
      response: jsonError("You can only publish resources for levels you teach.", 403),
    };
  }

  return {
    allowed: true,
    response: null,
  };
}

export async function POST(request: NextRequest) {
  let uploadedStoragePath = "";

  try {
    const { user, errorResponse } = await getAuthenticatedUser(request);

    if (errorResponse || !user) {
      return errorResponse;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.role) {
      console.error("Teacher resource profile lookup failed:", formatError(profileError));
      return jsonError("Unable to verify user profile.", 500);
    }

    if (profile.role !== "teacher" && profile.role !== "admin") {
      return jsonError("Only teachers can publish shared resources.", 403);
    }

    const formData = await request.formData();
    const levelValidation = validateTeacherResourceLevelId(formData.get("levelId"));
    const titleValidation = validateTeacherResourceTitle(formData.get("title"));
    const descriptionValidation = validateTeacherResourceDescription(
      formData.get("description")
    );
    const typeValidation = validateTeacherResourceType(formData.get("resourceType"));

    const firstValidationError =
      levelValidation.error ||
      titleValidation.error ||
      descriptionValidation.error ||
      typeValidation.error;

    if (firstValidationError) {
      return jsonError(firstValidationError, 400);
    }

    const levelId = levelValidation.value;
    const access = await verifyLevelAccess(user.id, profile.role, levelId);

    if (!access.allowed) {
      return access.response || jsonError("Unable to verify level access.", 500);
    }

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
            resource_scope: "shared_teacher",
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
        console.error("Teacher resource link insert failed:", formatError(error));
        return jsonError("Unable to publish resource.", 500);
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
    uploadedStoragePath = `shared/${levelId}/${user.id}/${randomUUID()}-${safeFilename}`;
    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(teacherResourcesBucket)
      .upload(uploadedStoragePath, fileBuffer, {
        contentType: fileEntry.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Teacher resource upload failed:", formatError(uploadError));
      return jsonError("Unable to upload resource file.", 500);
    }

    const { data, error: insertError } = await supabaseAdmin
      .from("teacher_resources")
      .insert([
        {
          title: titleValidation.value,
          description: descriptionValidation.value,
          resource_scope: "shared_teacher",
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
      console.error(
        "Teacher resource file insert failed:",
        formatError(insertError)
      );

      const { error: cleanupError } = await supabaseAdmin.storage
        .from(teacherResourcesBucket)
        .remove([uploadedStoragePath]);

      if (cleanupError) {
        console.error(
          "Teacher resource orphan file cleanup failed:",
          formatError(cleanupError)
        );
      }

      return jsonError("Unable to publish resource.", 500);
    }

    return NextResponse.json({ success: true, resourceId: data.id });
  } catch (error) {
    console.error("Teacher resource create route failed:", formatError(error));

    if (uploadedStoragePath) {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from(teacherResourcesBucket)
        .remove([uploadedStoragePath]);

      if (cleanupError) {
        console.error(
          "Teacher resource unexpected cleanup failed:",
          formatError(cleanupError)
        );
      }
    }

    return jsonError("Unable to publish resource.", 500);
  }
}

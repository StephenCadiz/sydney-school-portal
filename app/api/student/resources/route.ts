import { NextRequest, NextResponse } from "next/server";

import {
  isEligibleCambridgeExamLevel,
  normalizeCambridgeExamLevel,
} from "../../../../lib/cambridgeExamBank";
import { resolveStudentCurrentClassServer } from "../../../../lib/academicYearsServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const teacherResourcesBucket = "teacher-resources";
const signedUrlExpiresInSeconds = 120;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function logFailure(stage: string, error: unknown) {
  console.error("Student resources request failed:", { stage, error });
}

async function authenticateStudent(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return {
      studentId: "",
      errorResponse: jsonError("Authentication required.", 401),
    };
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    logFailure("authentication", authError);
    return {
      studentId: "",
      errorResponse: jsonError("Authentication required.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    logFailure("profile", profileError);
    return {
      studentId: "",
      errorResponse: jsonError("Unable to verify student access.", 500),
    };
  }
  if (profile?.role !== "student") {
    return {
      studentId: "",
      errorResponse: jsonError("Student access required.", 403),
    };
  }

  return { studentId: authData.user.id, errorResponse: null };
}

async function getCurrentClass(studentId: string) {
  try {
    const resolution = await resolveStudentCurrentClassServer(studentId);

    if (resolution.error || !resolution.classroom) {
      return {
        classroom: null,
        errorResponse: jsonError(
          resolution.error || "No current class is available.",
          resolution.error?.startsWith("More than one") ? 409 : 404
        ),
      };
    }

    return { classroom: resolution.classroom, errorResponse: null };
  } catch (error) {
    logFailure("current-class", error);
    return {
      classroom: null,
      errorResponse: jsonError("Unable to load class resources.", 500),
    };
  }
}

async function getCambridgeLevel(levelId: unknown) {
  const normalizedId = String(levelId || "").trim();
  if (!normalizedId) return null;

  const { data: level, error } = await supabaseAdmin
    .from("levels")
    .select("id, name")
    .eq("id", normalizedId)
    .maybeSingle();

  if (error) {
    logFailure("level", error);
    return null;
  }

  const levelName = normalizeCambridgeExamLevel(level?.name);
  if (!level || !isEligibleCambridgeExamLevel(levelName)) return null;

  return {
    id: String(level.id),
    name: levelName,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateStudent(request);
  if (auth.errorResponse) return auth.errorResponse;

  const currentClass = await getCurrentClass(auth.studentId);
  if (currentClass.errorResponse || !currentClass.classroom) {
    return (
      currentClass.errorResponse ||
      jsonError("Unable to load class resources.", 500)
    );
  }

  const classId = String(currentClass.classroom.id || "");
  if (!classId) return jsonError("Unable to load class resources.", 500);

  const { data: classRows, error: classResourceError } = await supabaseAdmin
    .from("resources")
    .select("id, title, description, resource_url")
    .eq("class_id", classId)
    .eq("active", true)
    .order("id", { ascending: true });
  if (classResourceError) {
    logFailure("class-resource-load", classResourceError);
    return jsonError("Unable to load class resources.", 500);
  }

  const classResources = (classRows || []).map((resource) => ({
    id: String(resource.id),
    title: resource.title,
    description: resource.description,
    resource_url: resource.resource_url,
    source: "class" as const,
    source_label: "Class Resource",
    level_name: null,
    requires_signed_url: false,
  }));

  const level = await getCambridgeLevel(currentClass.classroom.level_id);
  let cambridgeResources: Array<{
    id: string;
    title: string | null;
    description: string | null;
    resource_url: string | null;
    source: "cambridge_level";
    source_label: string;
    level_name: string;
    requires_signed_url: boolean;
  }> = [];

  if (level) {
    const { data: levelRows, error: levelResourceError } = await supabaseAdmin
      .from("teacher_resources")
      .select("id, title, description, external_url, storage_path, created_at")
      .eq("resource_scope", "cambridge_student")
      .eq("level_id", level.id)
      .order("created_at", { ascending: false });

    if (levelResourceError) {
      logFailure("cambridge-resource-load", levelResourceError);
    } else {
      cambridgeResources = (levelRows || []).map((resource) => ({
        id: String(resource.id),
        title: resource.title,
        description: resource.description,
        resource_url: resource.external_url,
        source: "cambridge_level" as const,
        source_label: `${level.name} Resource`,
        level_name: level.name,
        requires_signed_url: Boolean(resource.storage_path),
      }));
    }
  }

  return NextResponse.json(
    {
      resources: [...cambridgeResources, ...classResources],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticateStudent(request);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await request.json().catch(() => ({}));
  const resourceId = String(body.resourceId || "").trim();
  if (!resourceId) return jsonError("Resource ID is required.", 400);

  const currentClass = await getCurrentClass(auth.studentId);
  if (currentClass.errorResponse || !currentClass.classroom) {
    return (
      currentClass.errorResponse ||
      jsonError("Unable to open resource file.", 500)
    );
  }

  const level = await getCambridgeLevel(currentClass.classroom.level_id);
  if (!level) {
    return jsonError("You do not have access to this resource.", 403);
  }

  const { data: resource, error: resourceError } = await supabaseAdmin
    .from("teacher_resources")
    .select("id, storage_path")
    .eq("id", resourceId)
    .eq("resource_scope", "cambridge_student")
    .eq("level_id", level.id)
    .maybeSingle();

  if (resourceError) {
    logFailure("resource-open-lookup", resourceError);
    return jsonError("Unable to open resource file.", 500);
  }
  if (!resource) {
    return jsonError("You do not have access to this resource.", 403);
  }
  if (!resource.storage_path) {
    return jsonError("This resource is an external link.", 400);
  }

  const { data, error: signedUrlError } = await supabaseAdmin.storage
    .from(teacherResourcesBucket)
    .createSignedUrl(resource.storage_path, signedUrlExpiresInSeconds);

  if (signedUrlError || !data?.signedUrl) {
    logFailure("signed-url", signedUrlError);
    return jsonError("Unable to open resource file.", 500);
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    expiresIn: signedUrlExpiresInSeconds,
  });
}

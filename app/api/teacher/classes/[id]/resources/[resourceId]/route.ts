import { NextRequest, NextResponse } from "next/server";

import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "../../../../../../../lib/teacherHomeworkServer";
import { supabaseAdmin } from "../../../../../../../lib/supabaseAdmin";
import {
  TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH,
  validateTeacherResourceExternalUrl,
  validateTeacherResourceTitle,
} from "../../../../../../../lib/teacherResourceValidation";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_COLUMNS = "id, title, description, resource_url, class_id, active";
const UPDATE_BODY_KEYS = new Set(["title", "description", "resource_url"]);

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logFailure(stage: string, error: unknown) {
  console.error("Teacher class resource request failed:", { stage, error });
}

function validateDescription(value: unknown) {
  const description = String(value || "").trim();

  if (description.length > TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH) {
    return {
      value: description,
      error: `Description must be ${TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { value: description, error: "" };
}

async function loadClassResource(resourceId: string, classId: string) {
  const { data: resource, error } = await supabaseAdmin
    .from("resources")
    .select(RESOURCE_COLUMNS)
    .eq("id", resourceId)
    .maybeSingle();

  if (error) {
    logFailure("resource-load", error);
    return { resource: null, response: fail("Unable to verify the resource.", 500) };
  }
  if (!resource) {
    return { resource: null, response: fail("Resource not found.", 404) };
  }
  if (!resource.class_id || String(resource.class_id) !== classId) {
    return {
      resource: null,
      response: fail("You are not allowed to manage this resource.", 403),
    };
  }

  return { resource, response: null };
}

async function getRequestContext(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string; resourceId: string }> }
) {
  const { id: classId, resourceId } = await routeContext.params;

  if (!UUID.test(resourceId)) {
    return {
      classId: "",
      resourceId: "",
      response: fail("Choose a valid resource.", 400),
    };
  }

  try {
    const context = await authorizeTeacherHomeworkClass(request, classId);
    return {
      classId: context.classId,
      resourceId,
      response: null,
    };
  } catch (error) {
    if (error instanceof TeacherHomeworkError) {
      return { classId: "", resourceId: "", response: fail(error.message, error.status) };
    }

    logFailure("authorization", error);
    return {
      classId: "",
      resourceId: "",
      response: fail("Unable to verify class access.", 500),
    };
  }
}

export async function PATCH(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string; resourceId: string }> }
) {
  const requestContext = await getRequestContext(request, routeContext);
  if (requestContext.response) return requestContext.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("Invalid resource update request.", 400);
    }

    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => !UPDATE_BODY_KEYS.has(key))) {
      return fail("The request contains unsupported fields.", 400);
    }

    const title = validateTeacherResourceTitle(record.title);
    const description = validateDescription(record.description);
    const resourceUrl = validateTeacherResourceExternalUrl(record.resource_url);
    const validationError = title.error || description.error || resourceUrl.error;
    if (validationError) return fail(validationError, 400);

    const loaded = await loadClassResource(
      requestContext.resourceId,
      requestContext.classId
    );
    if (loaded.response) return loaded.response;

    const { data: resource, error } = await supabaseAdmin
      .from("resources")
      .update({
        title: title.value,
        description: description.value,
        resource_url: resourceUrl.value,
      })
      .eq("id", requestContext.resourceId)
      .eq("class_id", requestContext.classId)
      .select(RESOURCE_COLUMNS)
      .maybeSingle();

    if (error) {
      logFailure("resource-update", error);
      return fail("Unable to update the resource.", 500);
    }
    if (!resource) return fail("Resource not found.", 404);

    return NextResponse.json({ resource });
  } catch (error) {
    logFailure("update-unexpected", error);
    return fail("Unable to update the resource.", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string; resourceId: string }> }
) {
  const requestContext = await getRequestContext(request, routeContext);
  if (requestContext.response) return requestContext.response;

  try {
    const loaded = await loadClassResource(
      requestContext.resourceId,
      requestContext.classId
    );
    if (loaded.response) return loaded.response;

    const { data: deletedResource, error } = await supabaseAdmin
      .from("resources")
      .delete()
      .eq("id", requestContext.resourceId)
      .eq("class_id", requestContext.classId)
      .select("id")
      .maybeSingle();

    if (error) {
      logFailure("resource-delete", error);
      return fail("Unable to delete the resource.", 500);
    }
    if (!deletedResource) return fail("Resource not found.", 404);

    return NextResponse.json({ deleted: true, id: requestContext.resourceId });
  } catch (error) {
    logFailure("delete-unexpected", error);
    return fail("Unable to delete the resource.", 500);
  }
}

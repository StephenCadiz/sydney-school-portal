import { NextRequest, NextResponse } from "next/server";

import {
  ClassRegisterError,
  ClassRegisterUnavailableError,
  getClassRegisterUnavailableResponse,
  getTeacherClassRegisterContext,
  loadClassRegisterSnapshot,
  openClassRegister,
  saveClassRegister,
} from "../../../../../../lib/classRegisterServer";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function knownDatabaseMessage(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";
  const expected = [
    "Future Class Registers cannot be",
    "Invalid scheduled lesson",
    "Invalid Class Register",
    "Unsupported Class Register",
    "Duplicate Class Register",
    "The submitted roster",
    "Attendance must be Present or Absent",
    "Mark every student Present or Absent",
    "Completed Class Registers must remain complete",
    "Class Register was not found",
    "Class Register access denied",
  ];
  return expected.find((part) => message.includes(part)) ? message : "";
}

function handleFailure(stage: string, error: unknown) {
  if (error instanceof ClassRegisterUnavailableError) {
    return NextResponse.json(
      {
        ...getClassRegisterUnavailableResponse(error),
        error: error.message,
      },
      { status: error.status }
    );
  }
  if (error instanceof ClassRegisterError) {
    return jsonError(error.message, error.status);
  }
  const expected = knownDatabaseMessage(error);
  if (expected) {
    const status = expected.includes("access denied")
      ? 403
      : expected.includes("not found")
        ? 404
        : 422;
    return jsonError(expected, status);
  }
  console.error("Class Register request failed:", { stage, error });
  return jsonError("Unable to update Class Register.", 500);
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getTeacherClassRegisterContext(request, id);
    const lessonDate = String(
      request.nextUrl.searchParams.get("lessonDate") || ""
    ).trim();
    const scheduledStartTime = String(
      request.nextUrl.searchParams.get("startTime") || ""
    ).trim();
    const snapshot = await loadClassRegisterSnapshot(
      context,
      lessonDate ? { lessonDate, scheduledStartTime } : null
    );
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ClassRegisterUnavailableError) {
      return NextResponse.json(getClassRegisterUnavailableResponse(error), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return handleFailure("load", error);
  }
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await getTeacherClassRegisterContext(request, id);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Invalid Class Register request.", 400);
    }

    const action = String(body.action || "");
    if (action === "open") {
      if (
        Object.keys(body).some(
          (key) => !["action", "lesson_date", "scheduled_start_time"].includes(key)
        )
      ) {
        return jsonError("Unsupported Class Register request fields.", 400);
      }
      const snapshot = await openClassRegister(
        context,
        String(body.lesson_date || ""),
        String(body.scheduled_start_time || "")
      );
      return NextResponse.json(snapshot, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "save") {
      if (
        Object.keys(body).some(
          (key) =>
            !["action", "register_id", "entries", "complete"].includes(key)
        )
      ) {
        return jsonError("Unsupported Class Register request fields.", 400);
      }
      const snapshot = await saveClassRegister(context, {
        registerId: String(body.register_id || ""),
        entries: body.entries,
        complete: body.complete === true,
      });
      return NextResponse.json(snapshot, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return jsonError("Choose a valid Class Register action.", 400);
  } catch (error) {
    return handleFailure("write", error);
  }
}

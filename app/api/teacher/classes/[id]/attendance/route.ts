import { NextRequest, NextResponse } from "next/server";

import {
  ClassRegisterError,
  ClassRegisterUnavailableError,
  getClassRegisterUnavailableResponse,
  getTeacherStudentAttendance,
} from "../../../../../../lib/classRegisterServer";

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const studentId = String(
      request.nextUrl.searchParams.get("studentId") || ""
    ).trim();
    const requestedType = String(
      request.nextUrl.searchParams.get("studentType") || "profile"
    ).trim();
    if (requestedType !== "profile" && requestedType !== "young_learner") {
      return NextResponse.json(
        { error: "Student attendance was not found." },
        { status: 404 }
      );
    }
    const payload = await getTeacherStudentAttendance(
      request,
      id,
      requestedType,
      studentId
    );
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ClassRegisterUnavailableError) {
      return NextResponse.json(getClassRegisterUnavailableResponse(error), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (error instanceof ClassRegisterError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Teacher student attendance load failed:", error);
    return NextResponse.json(
      { error: "Unable to load attendance." },
      { status: 500 }
    );
  }
}

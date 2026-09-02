import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../../lib/cambridgeExamBankServer";
import {
  ClassRegisterError,
  getAdminStudentAttendance,
} from "../../../../../../lib/classRegisterServer";

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const { id } = await routeContext.params;
    const requestedType = String(
      request.nextUrl.searchParams.get("studentType") || ""
    ).trim();
    const studentType =
      requestedType === "cambridge" || requestedType === "profile"
        ? "profile"
        : requestedType === "young_learner"
          ? "young_learner"
          : null;
    if (!studentType) {
      return examBankJsonError("Student was not found.", 404);
    }

    return NextResponse.json(
      await getAdminStudentAttendance(studentType, id),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ClassRegisterError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("Admin student attendance load failed:", error);
    return examBankJsonError("Unable to load attendance.", 500);
  }
}

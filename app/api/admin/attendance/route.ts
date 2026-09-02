import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../lib/cambridgeExamBankServer";
import {
  AdminAttendanceError,
  getAdminAttendanceAlertCount,
  getAdminAttendanceClassDetails,
  getAdminAttendanceOverview,
  getAdminAttendanceStudentDetails,
  searchAdminAttendanceStudents,
} from "../../../../lib/adminAttendanceServer";
import type { AttendanceStudentType } from "../../../../lib/adminAttendance";

function noStore(payload: unknown) {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}

function getStudentType(value: string): AttendanceStudentType | null {
  if (value === "profile" || value === "cambridge") return "profile";
  if (value === "young_learner") return "young_learner";
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const view = String(request.nextUrl.searchParams.get("view") || "overview")
      .trim()
      .toLowerCase();
    const academicYearId = String(
      request.nextUrl.searchParams.get("academicYearId") || ""
    ).trim();

    if (view === "count") {
      return noStore({ count: await getAdminAttendanceAlertCount() });
    }
    if (view === "overview") {
      return noStore(await getAdminAttendanceOverview(academicYearId));
    }
    if (view === "class") {
      return noStore(
        await getAdminAttendanceClassDetails(
          String(request.nextUrl.searchParams.get("classId") || "").trim()
        )
      );
    }
    if (view === "students") {
      return noStore(
        {
          students: await searchAdminAttendanceStudents(
            String(request.nextUrl.searchParams.get("query") || "")
          ),
        }
      );
    }
    if (view === "student") {
      const studentType = getStudentType(
        String(request.nextUrl.searchParams.get("studentType") || "").trim()
      );
      if (!studentType) {
        return examBankJsonError("Student was not found.", 404);
      }
      return noStore(
        await getAdminAttendanceStudentDetails(
          studentType,
          String(request.nextUrl.searchParams.get("studentId") || "").trim(),
          academicYearId
        )
      );
    }

    return examBankJsonError("Attendance view was not found.", 404);
  } catch (error) {
    if (error instanceof AdminAttendanceError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("Admin Attendance Centre request failed:", error);
    return examBankJsonError("Unable to load attendance information.", 500);
  }
}

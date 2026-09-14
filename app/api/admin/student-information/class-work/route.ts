import { NextRequest, NextResponse } from "next/server";

import { requireExamBankAdmin } from "../../../../../lib/cambridgeExamBankServer";
import {
  loadAdminStudentClassWork,
  normalizeAdminClassWorkStudentType,
} from "../../../../../lib/adminClassWorkServer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  const studentType = normalizeAdminClassWorkStudentType(
    String(request.nextUrl.searchParams.get("studentType") || "").trim()
  );
  const studentId = String(
    request.nextUrl.searchParams.get("studentId") || ""
  ).trim();
  if (!studentType || !UUID_PATTERN.test(studentId)) {
    return response({ error: "Student was not found." }, 404);
  }

  try {
    return response({
      entries: await loadAdminStudentClassWork(studentType, studentId),
    });
  } catch (error) {
    console.error("Admin student Class Work load failed:", error);
    return response({ error: "Unable to load Class Work." }, 500);
  }
}

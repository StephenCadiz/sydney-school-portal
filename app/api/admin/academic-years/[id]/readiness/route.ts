import { NextRequest, NextResponse } from "next/server";

import {
  AcademicYearRolloverError,
  getAcademicYearSwitchReadiness,
} from "../../../../../../lib/academicYearRolloverServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../../lib/cambridgeExamBankServer";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  try {
    const readiness = await getAcademicYearSwitchReadiness(
      (await context.params).id,
      admin.userId
    );
    return NextResponse.json({ readiness });
  } catch (error) {
    if (error instanceof AcademicYearRolloverError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("Academic year readiness load failed:", error);
    return examBankJsonError("Unable to load academic year readiness.", 500);
  }
}

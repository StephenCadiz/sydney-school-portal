import { NextRequest, NextResponse } from "next/server";

import {
  AcademicYearRolloverError,
  applyAcademicYearRollover,
} from "../../../../../../../lib/academicYearRolloverServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../../../lib/cambridgeExamBankServer";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  try {
    const result = await applyAcademicYearRollover(
      (await context.params).id,
      admin.userId
    );
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof AcademicYearRolloverError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("Academic year rollover apply failed:", error);
    return examBankJsonError("Unable to apply the academic year rollover.", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";

import {
  AcademicYearRolloverError,
  getAcademicYearRolloverWorkspace,
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
    const workspace = await getAcademicYearRolloverWorkspace(
      (await context.params).id,
      admin.userId
    );
    return NextResponse.json({ workspace });
  } catch (error) {
    if (error instanceof AcademicYearRolloverError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("Academic year rollover workspace failed:", error);
    return examBankJsonError("Unable to load the rollover workspace.", 500);
  }
}

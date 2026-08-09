import { NextRequest, NextResponse } from "next/server";

import {
  AcademicYearRolloverError,
  saveAcademicYearRolloverDecisions,
} from "../../../../../../../lib/academicYearRolloverServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../../../lib/cambridgeExamBankServer";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const updatedCount = await saveAcademicYearRolloverDecisions({
      rolloverId: (await context.params).id,
      actorId: admin.userId,
      decisions: Array.isArray(body.decisions) ? body.decisions : [],
    });
    return NextResponse.json({ success: true, updated_count: updatedCount });
  } catch (error) {
    if (error instanceof AcademicYearRolloverError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("Academic year rollover decision save failed:", error);
    return examBankJsonError("Unable to save progression decisions.", 500);
  }
}

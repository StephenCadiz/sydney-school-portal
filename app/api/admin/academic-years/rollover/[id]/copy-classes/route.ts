import { NextRequest, NextResponse } from "next/server";

import {
  AcademicYearRolloverError,
  copyAcademicYearRolloverClasses,
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
    const body = (await request.json()) as Record<string, unknown>;
    const targetClassIds = await copyAcademicYearRolloverClasses({
      rolloverId: (await context.params).id,
      actorId: admin.userId,
      classes: Array.isArray(body.classes) ? body.classes : [],
    });
    return NextResponse.json({
      success: true,
      copied_class_ids: targetClassIds,
      copied_count: targetClassIds.length,
    });
  } catch (error) {
    if (error instanceof AcademicYearRolloverError) {
      return examBankJsonError(error.message, error.status);
    }
    console.error("Academic year class copy failed:", error);
    return examBankJsonError("Unable to copy the selected classes.", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";

import {
  AcademicYearRolloverError,
  createAcademicYearRollover,
  getAcademicYearRolloverLandingData,
} from "../../../../../lib/academicYearRolloverServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";

function failure(error: unknown, fallback: string) {
  if (error instanceof AcademicYearRolloverError) {
    return examBankJsonError(error.message, error.status);
  }
  console.error(fallback, error);
  return examBankJsonError(fallback, 500);
}

export async function GET(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  try {
    return NextResponse.json(await getAcademicYearRolloverLandingData());
  } catch (error) {
    return failure(error, "Unable to load academic year rollovers.");
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rollover = await createAcademicYearRollover({
      sourceAcademicYearId: String(body.source_academic_year_id || ""),
      targetAcademicYearId: String(body.target_academic_year_id || ""),
      actorId: admin.userId,
    });
    return NextResponse.json({ rollover }, { status: 201 });
  } catch (error) {
    return failure(error, "Unable to create the academic year rollover.");
  }
}

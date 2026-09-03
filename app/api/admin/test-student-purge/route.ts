import { NextRequest, NextResponse } from "next/server";

import {
  isSelectionValidationError,
  parseTestStudentSelection,
  requireTestStudentPurgeAdmin,
  TestStudentPurgeRequestError,
  type TestStudentPurgePreview,
} from "../../../../lib/adminTestStudentPurgeServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireTestStudentPurgeAdmin(request);

    const body = await request.json().catch(() => {
      throw new TestStudentPurgeRequestError("A valid JSON body is required.");
    });
    const students = parseTestStudentSelection(body?.students);

    if (body?.confirmation !== "DELETE") {
      throw new TestStudentPurgeRequestError(
        "Type DELETE to confirm permanent deletion."
      );
    }

    const { data, error } = await supabaseAdmin.rpc("purge_test_students", {
      p_students: students,
      p_confirmation: body.confirmation,
    });

    if (error) {
      console.error("Test student purge transaction failed:", {
        adminId,
        selectedCount: students.length,
        error,
      });

      if (isSelectionValidationError(error)) {
        return NextResponse.json(
          {
            error:
              "The selection is invalid or includes a protected non-student profile.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error:
            "Unable to purge the selected test students because protected data remains or the transaction could not be completed.",
        },
        { status: 409 }
      );
    }

    const result = data as TestStudentPurgePreview;

    console.info("Admin test student purge completed:", {
      adminId,
      profileStudents: result.students.profile,
      youngLearners: result.students.young_learner,
      dependentRows: result.total_dependent_rows,
    });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof TestStudentPurgeRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Test student purge request failed:", error);
    return NextResponse.json(
      { error: "Unable to purge the selected test students." },
      { status: 500 }
    );
  }
}

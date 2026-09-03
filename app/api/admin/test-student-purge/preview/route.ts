import { NextRequest, NextResponse } from "next/server";

import {
  isSelectionValidationError,
  parseTestStudentSelection,
  requireTestStudentPurgeAdmin,
  TestStudentPurgeRequestError,
  type TestStudentPurgePreview,
} from "../../../../../lib/adminTestStudentPurgeServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    await requireTestStudentPurgeAdmin(request);

    const body = await request.json().catch(() => {
      throw new TestStudentPurgeRequestError("A valid JSON body is required.");
    });
    const students = parseTestStudentSelection(body?.students);

    const { data, error } = await supabaseAdmin.rpc(
      "preview_test_student_purge",
      { p_students: students }
    );

    if (error) {
      console.error("Test student purge preview RPC failed:", error);

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
        { error: "Unable to prepare the test student purge preview." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      preview: data as TestStudentPurgePreview,
    });
  } catch (error) {
    if (error instanceof TestStudentPurgeRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Test student purge preview failed:", error);
    return NextResponse.json(
      { error: "Unable to prepare the test student purge preview." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import {
  parseTestClassId,
  requireTestClassPurgeAdmin,
  TestClassPurgeRequestError,
  type TestClassPurgePreview,
} from "../../../../lib/adminTestClassPurgeServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const coursePlanStorageBucket = "teacher-resources";

async function getCoursePlanStoragePaths(classId: string) {
  const { data, error } = await supabaseAdmin
    .from("course_plan_resources")
    .select(
      "storage_path, course_plan_days!inner (course_plans!inner (class_id))"
    )
    .eq("course_plan_days.course_plans.class_id", classId)
    .not("storage_path", "is", null);

  if (error) {
    throw new TestClassPurgeRequestError(
      "Unable to verify the test class resource files.",
      500
    );
  }

  return Array.from(
    new Set(
      (data || [])
        .map((resource) => String(resource.storage_path || ""))
        .filter(Boolean)
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireTestClassPurgeAdmin(request);

    const body = await request.json().catch(() => {
      throw new TestClassPurgeRequestError("A valid JSON body is required.");
    });
    const classId = parseTestClassId(body?.class_id);

    if (body?.confirmation !== "DELETE") {
      throw new TestClassPurgeRequestError(
        "Type DELETE to confirm permanent deletion."
      );
    }

    const storagePaths = await getCoursePlanStoragePaths(classId);
    const { data, error } = await supabaseAdmin.rpc("purge_test_class", {
      p_class_id: classId,
      p_confirmation: body.confirmation,
    });

    if (error) {
      console.error("Test class purge transaction failed:", {
        adminId,
        classId,
        error,
      });

      if (error.code === "23514") {
        return NextResponse.json(
          {
            error:
              "This class still has current students. Move them or purge the selected test students first.",
          },
          { status: 409 }
        );
      }

      if (error.code === "P0002") {
        return NextResponse.json(
          { error: "The selected class no longer exists." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error:
            "Unable to purge this test class because protected data remains or the transaction could not be completed.",
        },
        { status: 409 }
      );
    }

    let storageWarning = "";

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(coursePlanStorageBucket)
        .remove(storagePaths);

      if (storageError) {
        storageWarning =
          "The class was deleted, but one or more uploaded course-plan files require storage cleanup.";
        console.error("Test class purge storage cleanup failed:", {
          adminId,
          classId,
          fileCount: storagePaths.length,
          error: storageError,
        });
      }
    }

    const result = data as TestClassPurgePreview;

    console.info("Admin test class purge completed:", {
      adminId,
      classId,
      dependentRows: result.total_dependent_rows,
      storageFiles: storagePaths.length,
    });

    return NextResponse.json({
      result,
      ...(storageWarning ? { warning: storageWarning } : {}),
    });
  } catch (error) {
    if (error instanceof TestClassPurgeRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Test class purge request failed:", error);
    return NextResponse.json(
      { error: "Unable to purge the selected test class." },
      { status: 500 }
    );
  }
}

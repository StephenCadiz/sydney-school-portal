import { NextRequest, NextResponse } from "next/server";

import type { TestClassPurgePreview } from "../../../../../lib/adminTestClassPurgeServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function buildNormalDeleteBlockers(preview: TestClassPurgePreview) {
  return {
    students: preview.students.cambridge_current,
    young_learners: preview.students.young_learners_current,
    ...preview.dependencies,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      return jsonError("You must be logged in as an admin.", 401);
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonError("Your admin session is invalid or has expired.", 401);
    }

    const { data: adminProfile, error: adminProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (adminProfileError) {
      console.error("Normal class delete admin lookup failed:", adminProfileError);
      return jsonError("Unable to verify the admin account.", 500);
    }

    if (adminProfile?.role !== "admin") {
      return jsonError("Only admins can delete classes.", 403);
    }

    const body = await request.json().catch(() => null);
    const classId = String(body?.class_id || "").trim();

    if (!uuidPattern.test(classId)) {
      return jsonError("Choose a valid class.", 400);
    }

    const { data: previewData, error: previewError } = await supabaseAdmin.rpc(
      "preview_test_class_purge",
      { p_class_id: classId }
    );

    if (previewError) {
      if (previewError.code === "P0002") {
        return jsonError("Class not found.", 404);
      }

      console.error("Normal class delete dependency preview failed:", previewError);
      return jsonError("Unable to verify whether the class can be deleted.", 500);
    }

    const preview = previewData as TestClassPurgePreview;
    const blockers = buildNormalDeleteBlockers(preview);
    const hasBlockers = Object.values(blockers).some(
      (count) => Number(count) > 0
    );

    if (hasBlockers) {
      const message =
        "This class cannot be deleted normally because it contains linked data.";

      return NextResponse.json(
        {
          success: false,
          error: message,
          message,
          blockers,
        },
        { status: 409 }
      );
    }

    const { data: deletedClass, error: deleteError } = await supabaseAdmin
      .from("classes")
      .delete()
      .eq("id", classId)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      console.error("Normal class delete failed:", deleteError);
      return jsonError(
        "The class could not be deleted because linked data still exists.",
        409
      );
    }

    if (!deletedClass) {
      return jsonError("Class not found.", 404);
    }

    return NextResponse.json({
      success: true,
      message: "Class deleted successfully.",
    });
  } catch (error) {
    console.error("Normal class delete request failed:", error);
    return jsonError("Unable to delete the class.", 500);
  }
}

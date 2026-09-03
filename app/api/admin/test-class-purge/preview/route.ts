import { NextRequest, NextResponse } from "next/server";

import {
  parseTestClassId,
  requireTestClassPurgeAdmin,
  TestClassPurgeRequestError,
  type TestClassPurgePreview,
} from "../../../../../lib/adminTestClassPurgeServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    await requireTestClassPurgeAdmin(request);

    const body = await request.json().catch(() => {
      throw new TestClassPurgeRequestError("A valid JSON body is required.");
    });
    const classId = parseTestClassId(body?.class_id);
    const { data, error } = await supabaseAdmin.rpc(
      "preview_test_class_purge",
      { p_class_id: classId }
    );

    if (error) {
      console.error("Test class purge preview RPC failed:", error);

      if (error.code === "P0002") {
        return NextResponse.json(
          { error: "The selected class no longer exists." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: "Unable to prepare the test class purge preview." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      preview: data as TestClassPurgePreview,
    });
  } catch (error) {
    if (error instanceof TestClassPurgeRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Test class purge preview failed:", error);
    return NextResponse.json(
      { error: "Unable to prepare the test class purge preview." },
      { status: 500 }
    );
  }
}

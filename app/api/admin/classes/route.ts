import { NextRequest, NextResponse } from "next/server";

import { validateAdminClassPayload } from "../../../../lib/adminClassServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return examBankJsonError("Invalid JSON request body.", 400);
    }

    const levelId = Number((body as Record<string, unknown>)?.level_id);
    const { data: level, error: levelError } = await supabaseAdmin
      .from("levels")
      .select("id, name, catagory")
      .eq("id", levelId)
      .maybeSingle();
    if (levelError) return examBankJsonError("Unable to verify the level.", 500);

    const validation = validateAdminClassPayload(body, level);
    if (validation.error || !validation.value) {
      return examBankJsonError(validation.error || "Invalid class details.", 422);
    }

    const { data: classroom, error } = await supabaseAdmin
      .from("classes")
      .insert(validation.value)
      .select("*")
      .single();
    if (error) {
      console.error("Admin class creation failed:", {
        actorId: admin.userId,
        code: error.code,
      });
      return examBankJsonError("Unable to create the class.", 500);
    }

    return NextResponse.json({ class: classroom }, { status: 201 });
  } catch {
    return examBankJsonError("Unable to create the class.", 500);
  }
}

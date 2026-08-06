import { NextRequest, NextResponse } from "next/server";

import { isValidClassId } from "../../../../../lib/adminClassServer";
import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;
    const planId = (await context.params).id;
    if (!isValidClassId(planId)) return examBankJsonError("Invalid course plan identifier.", 400);
    const { data: plan, error } = await supabaseAdmin
      .from("course_plans")
      .select("id, class_id, status")
      .eq("id", planId)
      .maybeSingle();
    if (error) return examBankJsonError("Unable to load the course plan.", 500);
    if (!plan) return examBankJsonError("Course plan not found.", 404);
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Admin Course Planning detail failed:", error);
    return examBankJsonError("Unable to load the course plan.", 500);
  }
}

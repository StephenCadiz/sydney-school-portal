import { NextRequest, NextResponse } from "next/server";

import { requireExamBankAdmin } from "../../../../../lib/cambridgeExamBankServer";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

// The existing Admin delete action is a single database transaction, including
// Auth identity removal. Never run sequential application-table/Auth deletions.
export async function POST(request: NextRequest) {
  const admin = await requireExamBankAdmin(request);
  if (admin.response) return admin.response;
  const body = await request.json().catch(() => null);
  const type = body?.student_type || "cambridge";
  if (!body || typeof body.student_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.student_id) ||
    !["cambridge", "young_learner"].includes(type)) {
    return NextResponse.json({ error: "Choose a valid student and student type." }, { status: 400 });
  }
  const { error } = await supabaseAdmin.rpc("purge_test_students", {
    p_students: [{ student_type: type === "cambridge" ? "profile" : "young_learner", student_id: body.student_id }],
    p_confirmation: "DELETE",
  });
  if (error) {
    console.error("Atomic Admin student deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete the student. No partial deletion was saved." },
      { status: error.code === "22023" ? 400 : error.code === "42501" ? 403 : 500 });
  }
  return NextResponse.json({ success: true, message: "Student and related data deleted successfully." });
}

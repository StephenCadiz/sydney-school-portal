import { NextRequest, NextResponse } from "next/server";

import {
  examBankJsonError,
  requireExamBankAdmin,
} from "../../../../lib/cambridgeExamBankServer";
import { isCoursePlanningEligible } from "../../../../lib/coursePlanningEligibility";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function teacherName(profile: any) {
  return (String(profile?.first_name || "") + " " + String(profile?.last_name || "")).trim() || "Unassigned";
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireExamBankAdmin(request);
    if (admin.response) return admin.response;

    const { data: classes, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id, class_name, level_id, teacher_id, is_cambridge, course_type, start_date, end_date, days, start_time, end_time")
      .order("class_name", { ascending: true });
    if (classError) return examBankJsonError("Unable to load classes.", 500);
    const levelIds = Array.from(new Set((classes || []).map((row) => Number(row.level_id)).filter(Boolean)));
    const teacherIds = Array.from(new Set((classes || []).map((row) => String(row.teacher_id || "")).filter(Boolean)));
    const classIds = (classes || []).map((row) => String(row.id));
    const [levelsResult, teachersResult, plansResult] = await Promise.all([
      levelIds.length ? supabaseAdmin.from("levels").select("id, name").in("id", levelIds) : Promise.resolve({ data: [], error: null }),
      teacherIds.length ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", teacherIds) : Promise.resolve({ data: [], error: null }),
      classIds.length ? supabaseAdmin.from("course_plans").select("id, class_id, book_name, status, published_at, updated_at").in("class_id", classIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (levelsResult.error || teachersResult.error || plansResult.error) {
      return examBankJsonError("Unable to load Course Planning.", 500);
    }
    const planIds = (plansResult.data || []).map((plan) => String(plan.id));
    const { data: planDays, error: planDaysError } = planIds.length
      ? await supabaseAdmin
          .from("course_plan_days")
          .select("course_plan_id")
          .in("course_plan_id", planIds)
      : { data: [], error: null };
    if (planDaysError) return examBankJsonError("Unable to load planned teaching days.", 500);
    const levels = new Map((levelsResult.data || []).map((row) => [Number(row.id), String(row.name)]));
    const teachers = new Map((teachersResult.data || []).map((row) => [String(row.id), teacherName(row)]));
    const plans = new Map((plansResult.data || []).map((row) => [String(row.class_id), row]));
    const planDayCounts = new Map<string, number>();
    for (const day of planDays || []) {
      const id = String(day.course_plan_id);
      planDayCounts.set(id, (planDayCounts.get(id) || 0) + 1);
    }
    const coursePlans = (classes || [])
      .filter((classroom) =>
        isCoursePlanningEligible({
          isCambridge: classroom.is_cambridge === true,
          levelName: levels.get(Number(classroom.level_id)) || "",
          courseType: classroom.course_type,
        })
      )
      .map((classroom) => {
        const plan = plans.get(String(classroom.id));
        return {
          class_id: String(classroom.id),
          class_name: String(classroom.class_name || "").trim() || levels.get(Number(classroom.level_id)) || "Class",
          level: levels.get(Number(classroom.level_id)) || "",
          teacher_name: teachers.get(String(classroom.teacher_id || "")) || "Unassigned",
          course_type: String(classroom.course_type || ""),
          start_date: classroom.start_date || null,
          end_date: classroom.end_date || null,
          has_course_dates: Boolean(classroom.start_date && classroom.end_date),
          plan: plan
            ? {
                id: String(plan.id),
                book_name: String(plan.book_name || ""),
                status: String(plan.status),
                published_at: plan.published_at || null,
                updated_at: plan.updated_at || null,
                day_count: planDayCounts.get(String(plan.id)) || 0,
              }
            : null,
        };
      });
    return NextResponse.json(
      { course_plans: coursePlans },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin Course Planning overview failed:", error);
    return examBankJsonError("Unable to load Course Planning.", 500);
  }
}

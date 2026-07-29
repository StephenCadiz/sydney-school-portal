import { NextRequest, NextResponse } from "next/server";

import {
  authorizeTeacherHomeworkClass,
  TeacherHomeworkError,
} from "../../../../../../lib/teacherHomeworkServer";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function safeGoogleMeetUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "meet.google.com" ||
      url.pathname.replace(/\//g, "").length === 0
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await routeContext.params;
    const context = await authorizeTeacherHomeworkClass(request, id);

    if (context.courseType !== "online") {
      return fail("Google Meet is not available for this class.", 404);
    }

    const { data: classroom, error: classError } = await supabaseAdmin
      .from("classes")
      .select("course_type, meet_link")
      .eq("id", context.classId)
      .maybeSingle();
    if (classError) {
      return fail("Unable to load Google Meet information.", 500);
    }
    if (!classroom) return fail("Class was not found.", 404);
    if (String(classroom.course_type || "").trim().toLowerCase() !== "online") {
      return fail("Google Meet is not available for this class.", 404);
    }

    return NextResponse.json({
      class: {
        id: context.classId,
        course_type: context.courseType,
        meet_link: safeGoogleMeetUrl(classroom.meet_link),
      },
    });
  } catch (error) {
    if (error instanceof TeacherHomeworkError) {
      return fail(error.message, error.status);
    }

    console.error("Teacher Google Meet load failed.");
    return fail("Unable to load Google Meet information.", 500);
  }
}

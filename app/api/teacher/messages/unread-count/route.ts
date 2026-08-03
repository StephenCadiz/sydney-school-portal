import { NextRequest, NextResponse } from "next/server";

import {
  getTeacherCombinedUnreadMessageCount,
} from "../../../../../lib/teacherMessageUnreadCountServer";
import {
  authenticateTeacherMessageRequest,
  logTeacherStudentMessageFailure,
} from "../../../../../lib/teacherStudentMessagesServer";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateTeacherMessageRequest(request);
  if (auth.error) return jsonError(auth.error.message, auth.error.status);

  try {
    const { staffUnread, studentUnread, totalUnread } =
      await getTeacherCombinedUnreadMessageCount(auth.teacherId);

    return NextResponse.json(
      {
        staff_unread: staffUnread,
        student_unread: studentUnread,
        total_unread: totalUnread,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logTeacherStudentMessageFailure("combined-unread-count", error);
    return jsonError("Unable to load unread message count.", 500);
  }
}

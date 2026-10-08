import { NextRequest, NextResponse } from "next/server";

import {
  ClassProgressError,
  loadClassProgressReminders,
} from "../../../../../lib/classProgressServer";
import { authenticatePortalActor, sendPortalPush, tokenFromRequest } from "../../../../../lib/pushNotificationsServer";

export async function GET(request: NextRequest) {
  try {
    const payload = await loadClassProgressReminders(request);
    const actor = await authenticatePortalActor(tokenFromRequest(request));
    if (actor?.role === "teacher") {
      for (const reminder of payload?.reminders || []) {
        await sendPortalPush([actor.profileId], {
          eventKey: `class-progress-reminder:${reminder.class_id}:${reminder.lesson_date}`,
          title: "Class progress reminder",
          body: "Class progress needs your attention.",
          url: "/teacher",
          tag: `class-progress-reminder:${reminder.class_id}:${reminder.lesson_date}`,
        });
      }
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ClassProgressError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Class Progress reminders load failed:", error);
    return NextResponse.json(
      { error: "Unable to load Class Progress reminders." },
      { status: 500 }
    );
  }
}

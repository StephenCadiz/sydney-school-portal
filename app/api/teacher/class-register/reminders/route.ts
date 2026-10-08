import { NextRequest, NextResponse } from "next/server";

import {
  ClassRegisterError,
  loadClassRegisterReminders,
} from "../../../../../lib/classRegisterServer";
import { authenticatePortalActor, sendPortalPush, tokenFromRequest } from "../../../../../lib/pushNotificationsServer";

export async function GET(request: NextRequest) {
  try {
    const payload = await loadClassRegisterReminders(request);
    const actor = await authenticatePortalActor(tokenFromRequest(request));
    if (actor?.role === "teacher") {
      for (const reminder of payload?.reminders || []) {
        await sendPortalPush([actor.profileId], {
          eventKey: `class-register-reminder:${reminder.class_id}:${reminder.lesson_date}`,
          title: "Class register reminder",
          body: "A class register needs your attention.",
          url: "/teacher",
          tag: `class-register-reminder:${reminder.class_id}:${reminder.lesson_date}`,
        });
      }
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ClassRegisterError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Class Register reminders failed:", error);
    return NextResponse.json(
      { error: "Unable to load Class Register reminders." },
      { status: 500 }
    );
  }
}

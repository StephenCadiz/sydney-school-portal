import { NextRequest, NextResponse } from "next/server";

import {
  ClassRegisterError,
  loadClassRegisterReminders,
} from "../../../../../lib/classRegisterServer";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await loadClassRegisterReminders(request), {
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

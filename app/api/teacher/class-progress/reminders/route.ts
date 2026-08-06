import { NextRequest, NextResponse } from "next/server";

import {
  ClassProgressError,
  loadClassProgressReminders,
} from "../../../../../lib/classProgressServer";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await loadClassProgressReminders(request), {
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

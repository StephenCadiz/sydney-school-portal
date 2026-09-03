import { NextRequest, NextResponse } from "next/server";

import { generateStaffTimePdf } from "@/lib/staffTimePdf";
import {
  StaffTimeError,
  buildStaffTimeReport,
  parseReportQuery,
  requireStaffTimeAdmin,
} from "@/lib/staffTimeServer";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireStaffTimeAdmin(request);
    const query = parseReportQuery(request);
    const report = await buildStaffTimeReport(query);
    if (!report.teachers.length) {
      throw new StaffTimeError(
        "No configured Teacher records were found for the selected period.",
        422
      );
    }
    const bytes = await generateStaffTimePdf(report);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="registro-jornada-${report.start_date}-${report.end_date}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    if (error instanceof StaffTimeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Staff Time PDF generation failed:", error);
    return NextResponse.json(
      { error: "Unable to generate the official PDF." },
      { status: 500 }
    );
  }
}

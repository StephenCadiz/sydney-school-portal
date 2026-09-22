import { NextRequest, NextResponse } from "next/server";
import { authenticateSchoolRosterViewer, filterSchoolRoster, loadSchoolRoster } from "../../../lib/schoolRosterServer";

export async function GET(request: NextRequest) {
  const auth = await authenticateSchoolRosterViewer(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    const rows = await loadSchoolRoster(auth.profile!);
    return NextResponse.json(
      { classes: filterSchoolRoster(rows, new URL(request.url).searchParams) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the School Roster." }, { status: 500 });
  }
}

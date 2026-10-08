import { NextResponse } from "next/server";
import { pushPublicKey } from "../../../../lib/pushNotificationsServer";

export function GET() {
  return NextResponse.json({ publicKey: pushPublicKey(), enabled: Boolean(pushPublicKey()) }, { headers: { "Cache-Control": "no-store" } });
}

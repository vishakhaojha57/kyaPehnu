/** GET /api/auth/check-username?u=<username> — used by signup page for real-time availability */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u")?.toLowerCase() ?? "";
  if (!u || u.length < 3) return NextResponse.json({ taken: false });
  const { rows } = await db.query("SELECT 1 FROM kp_users WHERE username = $1", [u]);
  return NextResponse.json({ taken: rows.length > 0 });
}

/**
 * POST /api/auth/signup
 * Creates a new user with email + hashed password + unique username.
 * Username uniqueness is enforced at both DB (UNIQUE constraint) and API level.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, username } = await req.json();

    if (!name || !email || !password || !username) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    // Username rules: 3–20 chars, alphanumeric + underscore only
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return NextResponse.json(
        { error: "Username: 3-20 chars, lowercase letters, numbers, underscores only." },
        { status: 400 }
      );
    }

    // Check username uniqueness
    const usernameCheck = await db.query(
      "SELECT 1 FROM kp_users WHERE username = $1",
      [username]
    );
    if (usernameCheck.rows.length > 0) {
      return NextResponse.json({ error: "Username already taken. Try another." }, { status: 409 });
    }

    // Check email uniqueness
    const emailCheck = await db.query(
      "SELECT 1 FROM kp_users WHERE email = $1",
      [email]
    );
    if (emailCheck.rows.length > 0) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await db.query(
      `INSERT INTO kp_users (name, email, password_hash, username)
       VALUES ($1, $2, $3, $4)`,
      [name.trim(), email.toLowerCase().trim(), password_hash, username.toLowerCase()]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[signup] Error:", err);
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}

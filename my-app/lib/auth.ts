import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    Credentials({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const { rows } = await db.query(
          "SELECT id, name, email, username, image, password_hash FROM kp_users WHERE email = $1",
          [credentials.email]
        );

        const user = rows[0];
        if (!user || !user.password_hash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        );
        if (!valid) return null;

        return {
          id:       String(user.id),
          name:     user.name,
          email:    user.email,
          username: user.username,
          image:    user.image ?? null,
        };
      },
    }),
  ],

  pages: {
    signIn: "/login",
    error:  "/login",
  },

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id       = user.id;
        token.username = (user as { username?: string }).username ?? null;
      }

      // First Google sign-in: upsert user in Neon
      if (account?.provider === "google" && user) {
        const existingRows = await db.query(
          "SELECT id, username FROM kp_users WHERE email = $1",
          [user.email]
        );

        if (existingRows.rows.length === 0) {
          const baseSlug = (user.name ?? user.email ?? "user")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 18);
          const username = `${baseSlug}_${Math.floor(Math.random() * 9000 + 1000)}`;

          const inserted = await db.query(
            `INSERT INTO kp_users (name, email, image, username)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO NOTHING
             RETURNING id, username`,
            [user.name, user.email, user.image, username]
          );
          token.id       = String(inserted.rows[0]?.id ?? "");
          token.username = inserted.rows[0]?.username ?? username;
        } else {
          token.id       = String(existingRows.rows[0].id);
          token.username = existingRows.rows[0].username;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id       = token.id as string;
        (session.user as { username?: string }).username = token.username as string;
      }
      return session;
    },
  },
});

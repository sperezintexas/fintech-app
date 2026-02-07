import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import Credentials from "next-auth/providers/credentials";
import { validateAccessKey } from "@/lib/access-keys";
import { validateAuthUser } from "@/lib/auth-users";

const ALLOWED_USERNAMES = ["atxbogart", "sperezintexas", "shelleyperezatx"];

// Avoid [auth][warn][env-url-basepath-mismatch]: AUTH_URL/NEXTAUTH_URL path must be "/" or match basePath "/api/auth"
const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
if (envUrl) {
  try {
    const u = new URL(envUrl);
    if (u.pathname !== "/" && u.pathname !== "/api/auth") {
      process.env.AUTH_URL = u.origin;
      process.env.NEXTAUTH_URL = u.origin;
    }
  } catch {
    // ignore invalid URL
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/auth",
  trustHost: true,
  pages: { signIn: "/contact" },
  providers: [
    Twitter({
      clientId: process.env.X_CLIENT_ID ?? "",
      clientSecret: process.env.X_CLIENT_SECRET ?? "",
      profile({ data }) {
        return {
          id: data?.id ?? "",
          name: data?.name ?? null,
          username: data?.username ?? null,
          image: data?.profile_image_url ?? null,
        };
      },
    }),
    Credentials({
      name: "Access key or email/password",
      credentials: {
        key: { label: "Access key", type: "password" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials) return null;
        const key = credentials.key as string | undefined;
        const email = credentials.email as string | undefined;
        const password = credentials.password as string | undefined;

        if (key) {
          const ok = await validateAccessKey(key);
          if (ok) return { id: "key", name: "Key holder", email: null };
          return null;
        }
        if (email && password) {
          const ok = await validateAuthUser(email, password);
          if (ok) return { id: email, name: email, email };
          return null;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session }) {
      return !!session;
    },
    signIn({ user, profile }) {
      if (user?.id === "key" || user?.email) return true;
      const data = (profile as { data?: { username?: string } })?.data;
      const username = data?.username?.toLowerCase();
      if (!username) return false;
      return ALLOWED_USERNAMES.includes(username);
    },
    jwt({ token, user }) {
      if (user?.username) {
        token.username = user.username;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { username?: string }).username = token.username as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
});

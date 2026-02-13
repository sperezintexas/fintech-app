import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import Credentials from "next-auth/providers/credentials";
import { isAllowedXUsername } from "@/lib/x-allowed-usernames";

const AUTH_DEBUG = process.env.AUTH_DEBUG === "true" || process.env.AUTH_DEBUG === "1";

// Log once when auth module loads so you can confirm AUTH_DEBUG is read (check the terminal where pnpm dev runs, not browser or Kotlin)
if (process.env.AUTH_DEBUG !== undefined) {
  console.log("[auth] AUTH_DEBUG env:", JSON.stringify(process.env.AUTH_DEBUG), "-> debug enabled:", AUTH_DEBUG);
}

// Startup log for X OAuth (no secrets)
if (AUTH_DEBUG) {
  const hasClientId = !!(process.env.X_CLIENT_ID?.trim());
  const hasClientSecret = !!(process.env.X_CLIENT_SECRET?.trim());
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "(not set)";
  console.log("[auth] debug enabled", {
    X_CLIENT_ID: hasClientId ? "set" : "MISSING",
    X_CLIENT_SECRET: hasClientSecret ? "set" : "MISSING",
    NEXTAUTH_URL: authUrl,
    expectedCallback: `${authUrl === "(not set)" ? "http://localhost:3000" : authUrl}/api/auth/callback/twitter`,
  });
}

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
  debug: AUTH_DEBUG,
  logger: AUTH_DEBUG
    ? {
        error(code, ...message) {
          console.error("[auth]", code, ...message);
        },
        warn(code, ...message) {
          console.warn("[auth]", code, ...message);
        },
        debug(code, ...message) {
          console.log("[auth]", code, ...message);
        },
      }
    : undefined,
  pages: { signIn: "/contact", error: "/contact" },
  providers: [
    Twitter({
      clientId: process.env.X_CLIENT_ID ?? "",
      clientSecret: process.env.X_CLIENT_SECRET ?? "",
      userinfo: "https://api.x.com/2/users/me?user.fields=username,profile_image_url",
      profile({ data }) {
        if (AUTH_DEBUG && data) {
          console.log("[auth] X profile received", {
            id: data.id,
            username: data.username,
            name: data.name,
            keys: Object.keys(data),
          });
        }
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
        const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
        const baseUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
        if (!secret) return null;
        const url = new URL("/api/auth/validate-credentials", baseUrl).href;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            key: credentials.key,
            email: credentials.email,
            password: credentials.password,
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { ok?: boolean; user?: { id: string; name: string; email: string | null } };
        if (data.ok && data.user) return data.user;
        return null;
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session }) {
      return !!session;
    },
    async signIn({ user, profile }) {
      if (user?.id === "key" || user?.email) return true;
      const raw = profile as {
        data?: { username?: string; id?: string };
        username?: string;
        reason?: string;
        title?: string;
      } | undefined;
      if (raw?.reason === "client-not-enrolled" || raw?.title === "Client Forbidden") {
        console.error(
          "[auth] X API returned Client Forbidden: your app must be attached to a Project in the X Developer Portal. See https://developer.x.com/en/docs/projects/overview"
        );
        return false;
      }
      const fromUser = (user as { username?: string | null })?.username?.toLowerCase();
      const fromProfile =
        raw?.data?.username?.toLowerCase() ?? raw?.username?.toLowerCase();
      const username = fromUser ?? fromProfile;
      const allowed = username ? await isAllowedXUsername(username) : false;
      if (!username) {
        console.error("[auth] X sign-in: no username in user or profile", {
          userKeys: user ? Object.keys(user) : [],
          profileKeys: raw ? Object.keys(raw) : [],
          hasData: !!raw?.data,
        });
        return false;
      }
      if (!allowed) {
        console.error("[auth] X sign-in: username not allowed", { username });
        return false;
      }
      return true;
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

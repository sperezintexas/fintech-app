import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";

const ALLOWED_USERNAMES = ["atxbogart", "sperezintexas", "shelleyperezatx"];

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
  ],
  callbacks: {
    authorized({ auth: session }) {
      return !!session;
    },
    signIn({ profile }) {
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

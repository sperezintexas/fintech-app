import "next-auth";

declare module "next-auth" {
  interface User {
    username?: string | null;
  }

  interface Session {
    user: {
      username?: string | null;
      provider?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string | null;
    provider?: string;
  }
}

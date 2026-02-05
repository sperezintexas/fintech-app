import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ContactContent } from "./ContactContent";
import {
  recordLoginFailure,
  getClientIp,
} from "@/lib/login-failures";

const CALENDLY_URL = "https://calendly.com/sperezintexas";

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const accessDenied = params.error === "AccessDenied";
  const callbackUrl =
    typeof params.callbackUrl === "string" && params.callbackUrl.startsWith("/")
      ? params.callbackUrl
      : "/";

  if (session && !accessDenied) {
    redirect(callbackUrl);
  }

  if (accessDenied) {
    const headersList = await headers();
    const ip = getClientIp(headersList);
    const userAgent = headersList.get("user-agent") ?? undefined;
    try {
      const { blocked, alertCreated, attemptCount, distinctIpsInWindow } =
        await recordLoginFailure(ip, userAgent);
      console.error("[login-failure]", {
        ip,
        attemptCount,
        distinctIpsInWindow,
        blocked,
        alertCreated,
      });
      if (blocked) {
        redirect("/login-error");
      }
      if (alertCreated) {
        console.error("[login-failure] Security alert created: 10+ distinct IPs in window");
      }
    } catch (e) {
      console.error("[login-failure] recordLoginFailure failed", e);
    }
  }

  return (
    <ContactContent
      accessDenied={accessDenied}
      calendlyUrl={CALENDLY_URL}
      callbackUrl={callbackUrl}
    />
  );
}

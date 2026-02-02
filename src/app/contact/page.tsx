import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ContactContent } from "./ContactContent";

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

  return (
    <ContactContent
      accessDenied={accessDenied}
      calendlyUrl={CALENDLY_URL}
      callbackUrl={callbackUrl}
    />
  );
}

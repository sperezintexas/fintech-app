import { auth } from "@/auth";
import { HomePage } from "@/components/HomePage";

export default async function Home() {
  const session = await auth();
  const skipAuth = process.env.SKIP_AUTH === "true";
  return <HomePage session={session} skipAuth={skipAuth} />;
}

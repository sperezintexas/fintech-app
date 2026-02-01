"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect to Automation → Scheduled Jobs (Job Types are now embedded there). */
export default function JobTypesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/automation?tab=jobs");
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

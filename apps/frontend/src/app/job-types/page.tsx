import type { ReactNode } from "react";
import { redirect } from "next/navigation";

export default function JobTypesRedirect(): ReactNode {
  redirect("/automation/task-types");
  return null;
}

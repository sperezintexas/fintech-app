import { redirect } from "next/navigation";

export default function JobHistoryRedirect(): never {
  redirect("/automation/task-history");
}

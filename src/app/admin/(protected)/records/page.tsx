import { redirect } from "next/navigation";

export default function LegacyAdminRecordsPage() {
  redirect("/admin/visits");
}

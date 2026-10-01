import { SettingsPanel } from "@/components/SettingsPanel";
import { serviceStatus } from "@/lib/config";

// Read keys at request time so adding them in Vercel needs no rebuild.
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsPanel status={serviceStatus()} />;
}

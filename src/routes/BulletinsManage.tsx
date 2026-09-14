// Route shell only (#79). Drafting, publishing and editing arrive with #80,
// Remarks with #81 and Share Links with #83. The capability gate is real
// already, so the Role rule is settled before any of that lands.
import { MemberPage } from "../design/MemberPage";

export default function BulletinsManage() {
  return (
    <MemberPage
      title="Manage Bulletins"
      require="manageBulletins"
      backTo={{ to: "/bulletins", label: "Back to Bulletins" }}
    >
      {() => <p className="text-sm text-stone-500 dark:text-stone-400">Bulletin authoring isn't built yet.</p>}
    </MemberPage>
  );
}

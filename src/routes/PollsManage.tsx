// Route shell only (#79). Creating a Poll with Candidate Dates arrives with
// #84, editing an open Poll with #86, and closing/promoting with #87. The
// capability gate is real already, so the Role rule is settled first.
import { MemberPage } from "../design/MemberPage";

export default function PollsManage() {
  return (
    <MemberPage title="Manage Polls" require="managePolls" backTo={{ to: "/polls", label: "Back to Polls" }}>
      {() => <p className="text-sm text-stone-500 dark:text-stone-400">Poll authoring isn't built yet.</p>}
    </MemberPage>
  );
}

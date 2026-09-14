import { Routes, Route } from "react-router-dom";

import Home from "./routes/Home";
import SignIn from "./routes/SignIn";
import PublicEvents from "./routes/PublicEvents";
import PublicEventDetail from "./routes/PublicEventDetail";
import Library from "./routes/Library";
import PieceDetail from "./routes/PieceDetail";
import LibraryManage from "./routes/LibraryManage";
import Events from "./routes/Events";
import EventDetail from "./routes/EventDetail";
import EventsManage from "./routes/EventsManage";
import EventManageDetail from "./routes/EventManageDetail";
import Bulletins from "./routes/Bulletins";
import BulletinsManage from "./routes/BulletinsManage";
import Polls from "./routes/Polls";
import PollsManage from "./routes/PollsManage";
import PollManageDetail from "./routes/PollManageDetail";
import Members from "./routes/Members";
import MembersManage from "./routes/MembersManage";
import Settings from "./routes/Settings";
import NotFound from "./routes/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/public/events" element={<PublicEvents />} />
      <Route path="/public/events/:eventId" element={<PublicEventDetail />} />
      <Route path="/library" element={<Library />} />
      <Route path="/library/manage" element={<LibraryManage />} />
      <Route path="/library/:pieceId" element={<PieceDetail />} />
      <Route path="/events" element={<Events />} />
      <Route path="/events/manage" element={<EventsManage />} />
      <Route path="/events/manage/:eventId" element={<EventManageDetail />} />
      <Route path="/events/:eventId" element={<EventDetail />} />
      <Route path="/bulletins" element={<Bulletins />} />
      <Route path="/bulletins/manage" element={<BulletinsManage />} />
      <Route path="/polls" element={<Polls />} />
      <Route path="/polls/manage" element={<PollsManage />} />
      <Route path="/polls/manage/:pollId" element={<PollManageDetail />} />
      <Route path="/members" element={<Members />} />
      <Route path="/members/manage" element={<MembersManage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

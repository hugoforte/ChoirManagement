import { Routes, Route } from "react-router-dom";

import Home from "./routes/Home";
import SignIn from "./routes/SignIn";
import PublicEvents from "./routes/PublicEvents";
import PublicEventDetail from "./routes/PublicEventDetail";
import NotFound from "./routes/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/public/events" element={<PublicEvents />} />
      <Route path="/public/events/:eventId" element={<PublicEventDetail />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

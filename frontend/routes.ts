import { createBrowserRouter } from "react-router";
import { Landing } from "./components/views/Landing";
import { TerminalView } from "./components/views/TerminalView";
import { BoardView } from "./components/views/BoardView";
import { JoinTerminalView } from "./components/views/JoinTerminalView";
import { AdminConfigView } from "./components/views/AdminConfigView";
import { SessionCreateView } from "./components/views/SessionCreateView";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Landing,
  },
  {
    path: "/join",
    Component: JoinTerminalView,
  },
  {
    path: "/terminal",
    Component: TerminalView,
  },
  {
    path: "/config",
    Component: AdminConfigView,
  },
  {
    path: "/board",
    Component: BoardView,
  },
  {
    path: "/host",
    Component: SessionCreateView,
  },
]);
import { createElement } from "react";
import { createBrowserRouter } from "react-router";
import { Landing } from "./components/views/Landing";
import { LobbyView } from "./components/views/LobbyView";
import { TerminalView } from "./components/views/TerminalView";
import { BoardView } from "./components/views/BoardView";
import { JoinTerminalView } from "./components/views/JoinTerminalView";
import { AdminConfigView } from "./components/views/AdminConfigView";
import { SessionCreateView } from "./components/views/SessionCreateView";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

function ProtectedAdminConfig() {
  return createElement(ProtectedRoute, null, createElement(AdminConfigView));
}

function ProtectedSessionCreate() {
  return createElement(ProtectedRoute, null, createElement(SessionCreateView));
}

function ProtectedBoardView() {
  return createElement(ProtectedRoute, null, createElement(BoardView));
}

function ProtectedLobbyView() {
  return createElement(ProtectedRoute, null, createElement(LobbyView));
}

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
    Component: ProtectedAdminConfig,
  },
  {
    path: "/lobby",
    Component: ProtectedLobbyView,
  },
  {
    path: "/board",
    Component: ProtectedBoardView,
  },
  {
    path: "/host",
    Component: ProtectedSessionCreate,
  },
]);
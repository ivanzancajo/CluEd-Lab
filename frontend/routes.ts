import { createElement, lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter } from "react-router";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

const Landing = lazy(async () => ({ default: (await import("./components/views/Landing")).Landing }));
const LobbyView = lazy(async () => ({ default: (await import("./components/views/LobbyView")).LobbyView }));
const TerminalView = lazy(async () => ({ default: (await import("./components/views/TerminalView")).TerminalView }));
const BoardView = lazy(async () => ({ default: (await import("./components/views/BoardView")).BoardView }));
const JoinTerminalView = lazy(async () => ({ default: (await import("./components/views/JoinTerminalView")).JoinTerminalView }));
const AdminConfigView = lazy(async () => ({ default: (await import("./components/views/AdminConfigView")).AdminConfigView }));
const SessionCreateView = lazy(async () => ({ default: (await import("./components/views/SessionCreateView")).SessionCreateView }));

const routeLoadingFallback = createElement(
  "div",
  {
    className: "min-h-screen flex items-center justify-center bg-slate-950 text-cyan-300 font-mono uppercase tracking-[0.2em]",
  },
  "Cargando interfaz..."
);

function withSuspense(Component: ComponentType) {
  return function SuspendedRoute() {
    return createElement(
      Suspense,
      { fallback: routeLoadingFallback },
      createElement(Component)
    );
  };
}

function withProtectedSuspense(Component: ComponentType) {
  return function ProtectedSuspendedRoute() {
    return createElement(
      Suspense,
      { fallback: routeLoadingFallback },
      createElement(ProtectedRoute, null, createElement(Component))
    );
  };
}

const LandingRoute = withSuspense(Landing);
const JoinTerminalRoute = withSuspense(JoinTerminalView);
const TerminalRoute = withSuspense(TerminalView);
const ProtectedAdminConfig = withProtectedSuspense(AdminConfigView);
const ProtectedLobbyView = withProtectedSuspense(LobbyView);
const ProtectedBoardView = withProtectedSuspense(BoardView);
const ProtectedSessionCreate = withProtectedSuspense(SessionCreateView);

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingRoute,
  },
  {
    path: "/join",
    Component: JoinTerminalRoute,
  },
  {
    path: "/terminal",
    Component: TerminalRoute,
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
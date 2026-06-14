import { createElement, lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter } from "react-router";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { RouterErrorPage } from "./components/RouterErrorPage";

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

const errorElement = createElement(RouterErrorPage);

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingRoute,
    errorElement,
  },
  {
    path: "/join",
    Component: JoinTerminalRoute,
    errorElement,
  },
  {
    path: "/terminal",
    Component: TerminalRoute,
    errorElement,
  },
  {
    path: "/config",
    Component: ProtectedAdminConfig,
    errorElement,
  },
  {
    path: "/lobby",
    Component: ProtectedLobbyView,
    errorElement,
  },
  {
    path: "/board",
    Component: ProtectedBoardView,
    errorElement,
  },
  {
    path: "/host",
    Component: ProtectedSessionCreate,
    errorElement,
  },
]);
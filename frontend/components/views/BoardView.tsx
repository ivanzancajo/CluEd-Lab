import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { m } from "motion/react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Box,
  Clock,
  Download,
  Flag,
  History,
  KeyRound,
  LoaderCircle,
  MapPin,
  MonitorPlay,
  Pause,
  Play,
  RefreshCw,
  User,
  Users,
} from "lucide-react";
import { useExitGuard } from "../../src/hooks/useExitGuard";
import {
  createLobbySocketClient,
  endSessionFromBoard,
  pauseGameFromBoard,
  resumeGameFromBoard,
  subscribeHostToLobby,
  triggerResolutionFromBoard,
  type LobbySocketClient,
  type LobbyEventMessage,
  type LobbyPresenceState,
} from "../../src/lib/lobbySocket";
import {
  buildBoardDebugProbe,
  getStoredBoardDebugMode,
  setStoredBoardDebugMode,
  type BoardDebugProbe,
} from "../../src/lib/boardDebug";
import { findNearestBoardMovementNode } from "../../src/lib/boardMovement";
import {
  getStoredSessionCode,
  getStoredSessionDurationSeconds,
  getStoredSessionId,
  getStoredSessionStartedAt,
  setStoredSessionStatus,
  storeHostLobbySession,
} from "../../src/lib/lobbyStorage";
import {
  mapBoardSpaces,
  readStoredActiveBoardConfig,
  type BoardSpaceLabel,
  type StoredBoardConfig,
  type StoredBoardItem,
} from "../../src/lib/boardTheme";
import { getTeamMonitoringLabel, getTeamMonitoringStatus } from "../../src/lib/teamMonitoring";
import { TEAM_METADATA } from "../../src/lib/teamMeta";
import {
  downloadSessionAuditLog,
  getGameSession,
  getSessionErrorMessage,
  type AuditLogFormat,
  type GameResolutionMode,
  type LobbySession,
  type ResolutionCard,
} from "../../src/lib/sessionApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { ThemedBoard } from "../game/ThemedBoard";
import { SpaceMotifModal } from "../game/SpaceMotifModal";
import { EnvelopeAnimation } from "../game/EnvelopeAnimation";
import { EvidenciasComunes } from "../game/EvidenciasComunes";
import { RulesModal } from "../game/RulesModal";
import { GameOverModal } from "../game/GameOverModal";

type BoardConnectionStatus = "idle" | "connecting" | "connected" | "error";
type TeamSlotStatus = "free" | "connected" | "inactive" | "disconnected";

export function BoardView() {
  const navigate = useNavigate();
  const location = useLocation();
  const socketRef = useRef<LobbySocketClient | null>(null);
  const shouldAnimateOnMount = !!(location.state as { showEnvelopeAnimation?: boolean } | null)?.showEnvelopeAnimation;
  const hasAnimatedRef = useRef(shouldAnimateOnMount);
  const [showEnvelopeAnimation, setShowEnvelopeAnimation] = useState(shouldAnimateOnMount);
  const [timeRemaining, setTimeRemaining] = useState(() =>
    calculateRemainingSeconds(getStoredSessionStartedAt(), getStoredSessionDurationSeconds() ?? 0)
  );
  const [sessionCode, setSessionCode] = useState(() => getStoredSessionCode() || "N/A");
  const [boardConfig, setBoardConfig] = useState(() => readStoredActiveBoardConfig());
  const [presenceState, setPresenceState] = useState<LobbyPresenceState | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const hasShownGameOverRef = useRef(false);
  const hasAutoOpenedResolutionRef = useRef(false);

  const isBoardActive = presenceState !== null && presenceState.status !== "FINALIZADA";
  const { showConfirm: showExitConfirm, openConfirm: openExitConfirm, cancelExit } = useExitGuard(isBoardActive);
  const [events, setEvents] = useState<LobbyEventMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<BoardConnectionStatus>("idle");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [isChangingGameStatus, setIsChangingGameStatus] = useState(false);
  const [isResolutionDialogOpen, setIsResolutionDialogOpen] = useState(false);
  const [isTriggeringResolution, setIsTriggeringResolution] = useState(false);
  const [isBoardDebugEnabled, setIsBoardDebugEnabled] = useState(() => getStoredBoardDebugMode());
  const [boardDebugProbe, setBoardDebugProbe] = useState<BoardDebugProbe | null>(null);
  const [activeMotifSpace, setActiveMotifSpace] = useState<BoardSpaceLabel | null>(null);
  const [monitoringNow, setMonitoringNow] = useState(() => Date.now());
  const [isDownloadingAudit, setIsDownloadingAudit] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => setMonitoringNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (presenceState?.status !== "FINALIZADA" || hasShownGameOverRef.current) return;
    hasShownGameOverRef.current = true;
    const timer = setTimeout(() => setShowGameOverModal(true), 800);
    return () => clearTimeout(timer);
  }, [presenceState?.status]);

  // react-doctor-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (!presenceState) {
      return;
    }

    if (presenceState.status === "LOBBY") {
      navigate("/lobby", { replace: true });
      return;
    }

    if (presenceState.status === "PAUSADA") {
      setTimeRemaining(presenceState.remainingSeconds);
      return;
    }

    if (presenceState.status === "FINALIZADA") {
      setTimeRemaining(presenceState.remainingSeconds);
      setIsChangingGameStatus(false);
      setIsResolutionDialogOpen(false);
      setIsTriggeringResolution(false);
      setActiveMotifSpace(null);
      return;
    }

    const updateTimeRemaining = () => {
      const remaining = calculateRemainingSeconds(presenceState.startedAt, presenceState.durationSeconds);
      setTimeRemaining(remaining);

      // Al agotarse el tiempo abrimos una sola vez el diálogo de resolución para que lo
      // gestione el game master (revelar solución o habilitar acusación final).
      if (remaining > 0) {
        hasAutoOpenedResolutionRef.current = false;
      } else if (!presenceState.resolution && !hasAutoOpenedResolutionRef.current) {
        hasAutoOpenedResolutionRef.current = true;
        setIsResolutionDialogOpen(true);
      }
    };

    updateTimeRemaining();
    const timer = window.setInterval(updateTimeRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [navigate, presenceState]);

  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup, react-doctor/no-cascading-set-state
  useEffect(() => {
    let active = true;
    const socket = createLobbySocketClient({ admin: true });
    socketRef.current = socket;

    const applyPresenceState = (state: LobbyPresenceState) => {
      if (!active) {
        return;
      }

      if (state.status === "LOBBY") {
        navigate("/lobby", { replace: true });
        return;
      }

      setPresenceState(state);
      setSessionCode(state.accessCode);
      setStoredSessionStatus(state.status);
      setBoardError(null);
      setConnectionStatus("connected");
    };

    const connectBoardToSession = async () => {
      setConnectionStatus("connecting");
      setBoardError(null);

      try {
        const resolvedSessionId = await resolveSessionId();

        if (!active) {
          return;
        }

        if (!resolvedSessionId) {
          throw new Error("No hay una partida activa para la pantalla central.");
        }

        socket.on("lobby:presence-updated", applyPresenceState);
        socket.on("lobby:event", (event) => {
          if (!active) {
            return;
          }

          setEvents((currentEvents) => [event, ...currentEvents].slice(0, 10));
        });
        socket.on("game:status-changed", (payload) => {
          if (!active) {
            return;
          }

          const updatedSession = payload.session;
          storeHostLobbySession(updatedSession);
          setPresenceState((currentState) => mergeLobbySessionIntoPresence(currentState, updatedSession, payload.occurredAt));
        });
        socket.on("game:final-chance-start", (payload) => {
          if (!active) {
            return;
          }

          storeHostLobbySession(payload.session);
          setPresenceState((currentState) => mergeLobbySessionIntoPresence(currentState, payload.session, payload.occurredAt));
        });
        socket.on("game:show-solution", (payload) => {
          if (!active) {
            return;
          }

          storeHostLobbySession(payload.session);
          setPresenceState((currentState) => mergeLobbySessionIntoPresence(currentState, payload.session, payload.occurredAt));
        });
        socket.on("gameStarted", (payload) => {
          if (!active) {
            return;
          }

          storeHostLobbySession(payload.session);
          setPresenceState((currentState) => mergeLobbySessionIntoPresence(currentState, payload.session, payload.occurredAt));

          if (!hasAnimatedRef.current && payload.session.status === "EN_CURSO") {
            hasAnimatedRef.current = true;
            setShowEnvelopeAnimation(true);
          }
        });
        socket.on("disconnect", () => {
          if (!active) {
            return;
          }

          setConnectionStatus("connecting");
        });
        socket.on("connect_error", () => {
          if (!active) {
            return;
          }

          setConnectionStatus("error");
          setBoardError("No se ha podido conectar la pantalla central con el servicio realtime de la partida.");
        });
        socket.on("connect", async () => {
          const response = await subscribeHostToLobby(socket, resolvedSessionId);

          if (!active) {
            return;
          }

          if (!response.ok) {
            setConnectionStatus("error");
            setBoardError(response.error);
            return;
          }

          applyPresenceState(response.state);
        });

        socket.connect();
      } catch (error) {
        if (!active) {
          return;
        }

        setConnectionStatus("error");
        setBoardError(
          error instanceof Error
            ? error.message
            : getSessionErrorMessage(error, "No se ha podido cargar la partida activa para la pantalla central.")
        );
      }
    };

    connectBoardToSession();

    return () => {
      active = false;
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [navigate]);

  const monitoredTeams = presenceState?.teams ?? [];
  const currentTurn = presenceState?.turn ?? null;
  const connectedCount = monitoredTeams.filter((team) => getTeamMonitoringStatus(team, monitoringNow) === "connected").length;
  const inactiveCount = monitoredTeams.filter((team) => getTeamMonitoringStatus(team, monitoringNow) === "inactive").length;
  const disconnectedCount = monitoredTeams.filter((team) => getTeamMonitoringStatus(team, monitoringNow) === "disconnected").length;
  const teamSlots = TEAM_METADATA.map((teamMeta) => {
    const joinedTeam = presenceState?.teams.find((team) => team.color === teamMeta.color) ?? null;
    const teamStatus: TeamSlotStatus = !joinedTeam ? "free" : getTeamMonitoringStatus(joinedTeam, monitoringNow);

    return {
      ...teamMeta,
      team: joinedTeam,
      status: teamStatus,
      statusLabel:
        teamStatus === "connected"
          ? "Conectado"
          : teamStatus === "inactive"
          ? "Inactivo"
          : teamStatus === "disconnected"
          ? "Desconectado"
          : "Libre",
      secondaryText: joinedTeam ? getTeamMonitoringLabel(joinedTeam, monitoringNow) : "Color no asignado",
    };
  });

  const visibleEvents =
    events.length > 0
      ? events
      : [
          {
            id: "active-room",
            type: "system" as const,
            message:
              connectionStatus === "connected"
                ? "Partida en curso. Monitorizando la presencia de los equipos."
                : "Conectando la pantalla central con la partida...",
            occurredAt: Date.now(),
          },
        ];
  const latestAccusationEvent =
    events.find((event) => event.type === "final-accusation-verdict" && event.accusationVerdict) ?? null;
  const activeResolution = presenceState?.resolution ?? null;
  const resolutionSubmittedCount = activeResolution?.submittedTeamIds.length ?? 0;
  const resolutionEligibleCount = activeResolution?.eligibleTeamIds.length ?? 0;
  const resolutionCountdownSeconds = getResolutionCountdownSeconds(activeResolution?.deadlineAt, monitoringNow);
  const isBoardSolutionVisible = activeResolution?.phase === "MOSTRANDO_SOLUCION" && Boolean(activeResolution.solution);
  const boardSolutionCards = activeResolution?.solution
    ? buildBoardResolutionCards(activeResolution.solution, boardConfig)
    : [];
  const canManageGameControls = presenceState?.status === "EN_CURSO" || presenceState?.status === "PAUSADA";
  const shouldShowGameControlButtons = canManageGameControls || Boolean(activeResolution);
  const canOpenResolutionDialog =
    connectionStatus === "connected" &&
    presenceState?.status === "EN_CURSO" &&
    !presenceState?.resolution;
  const boardControlStatusTone =
    presenceState?.status === "PAUSADA"
      ? "border-amber-600/50 bg-amber-950/25 text-amber-100"
      : presenceState?.status === "FINALIZADA"
      ? "border-red-700/50 bg-red-950/25 text-red-100"
      : "border-emerald-600/50 bg-emerald-950/25 text-emerald-100";
  const boardTurnStatusLabel =
    presenceState?.status === "FINALIZADA"
      ? "Sin turnos"
      : currentTurn?.dice
      ? "Tirada lista"
      : "Esperando tirada";
  const boardTurnStatusTone =
    presenceState?.status === "FINALIZADA"
      ? "border-red-700/50 bg-red-950/25 text-red-100"
      : currentTurn?.dice
      ? "border-emerald-600/50 bg-emerald-950/25 text-emerald-100"
      : "border-cyan-600/50 bg-cyan-950/25 text-cyan-100";
  const boardControlQuickLabel = activeResolution
    ? "Resolución activa"
    : presenceState?.status === "PAUSADA"
    ? "Reanudación lista"
    : presenceState?.status === "FINALIZADA"
    ? "Sin acciones"
    : "Acciones rápidas";
  const boardControlQuickTone = activeResolution
    ? "border-amber-600/50 bg-amber-950/25 text-amber-100"
    : presenceState?.status === "FINALIZADA"
    ? "border-slate-700/60 bg-slate-950/60 text-slate-300"
    : "border-cyan-600/50 bg-cyan-950/25 text-cyan-100";

  const gameOverWinner =
    activeResolution?.winningTeams[0]
      ? { name: activeResolution.winningTeams[0].name, color: activeResolution.winningTeams[0].color }
      : latestAccusationEvent?.accusationVerdict?.outcome === "CORRECTA"
      ? { name: latestAccusationEvent.accusationVerdict.accuserTeamName, color: latestAccusationEvent.accusationVerdict.accuserTeamColor }
      : null;
  const gameOverSolution = latestAccusationEvent?.accusationVerdict?.outcome === "CORRECTA"
    ? { subject: latestAccusationEvent.accusationVerdict.accusation.subject.name, object: latestAccusationEvent.accusationVerdict.accusation.object.name, space: latestAccusationEvent.accusationVerdict.accusation.space.name }
    : null;

  const boardSpaces = mapBoardSpaces(boardConfig);
  const boardCenterImage = getRenderableBoardCenterImage(boardConfig?.centerImage);
  const boardPawns = monitoredTeams.map((team) => ({
    id: team.id,
    color: team.color,
    positionX: team.positionX,
    positionY: team.positionY,
    isEliminated: Boolean(team.eliminatedAt),
    opacity:
      getTeamMonitoringStatus(team, monitoringNow) === "connected"
        ? 1
        : getTeamMonitoringStatus(team, monitoringNow) === "inactive"
        ? 0.7
        : 0.35,
  }));

  const handleBoardDebugToggle = () => {
    setIsBoardDebugEnabled((currentValue) => {
      const nextValue = !currentValue;
      setStoredBoardDebugMode(nextValue);
      if (!nextValue) {
        setBoardDebugProbe(null);
      }
      return nextValue;
    });
  };

  const handleBoardDebugSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const boardBounds = event.currentTarget.getBoundingClientRect();
    if (boardBounds.width === 0 || boardBounds.height === 0) {
      return;
    }

    const positionX = ((event.clientX - boardBounds.left) / boardBounds.width) * 100;
    const positionY = ((event.clientY - boardBounds.top) / boardBounds.height) * 100;
    const matchedNode = findNearestBoardMovementNode(positionX, positionY);
    setBoardDebugProbe(buildBoardDebugProbe(positionX, positionY, matchedNode));
  };

  const handleToggleGameStatus = async () => {
    if (!presenceState) {
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setBoardError("No hay conexión realtime para cambiar el estado de la partida.");
      return;
    }

    if (presenceState.status !== "EN_CURSO" && presenceState.status !== "PAUSADA") {
      setBoardError("La partida no admite pausas en su estado actual.");
      return;
    }

    if (presenceState.resolution) {
      setBoardError("La partida está en fase de resolución y no admite cambios de pausa o reanudación.");
      return;
    }

    setIsChangingGameStatus(true);
    setBoardError(null);

    try {
      const response =
        presenceState.status === "EN_CURSO"
          ? await pauseGameFromBoard(socket, presenceState.sessionId)
          : await resumeGameFromBoard(socket, presenceState.sessionId);

      if (!response.ok) {
        setBoardError(response.error);
        return;
      }

      setPresenceState((currentState) => {
        return mergeLobbySessionIntoPresence(currentState, response.payload.session, response.payload.occurredAt);
      });
    } finally {
      setIsChangingGameStatus(false);
    }
  };

  const handleTriggerResolution = async (mode: GameResolutionMode) => {
    if (!presenceState) {
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setBoardError("No hay conexión realtime para abrir la fase de resolución.");
      return;
    }

    if (presenceState.status !== "EN_CURSO") {
      setBoardError("La resolución solo puede activarse mientras la partida siga en curso.");
      return;
    }

    if (presenceState.resolution) {
      setBoardError("La sesión ya tiene una fase de resolución activa.");
      return;
    }

    setIsTriggeringResolution(true);
    setBoardError(null);

    try {
      const response = await triggerResolutionFromBoard(socket, presenceState.sessionId, mode);

      if (!response.ok) {
        setBoardError(response.error);
        return;
      }

      setPresenceState((currentState) => mergeLobbySessionIntoPresence(currentState, response.payload.session, response.payload.occurredAt));
      setIsResolutionDialogOpen(false);
    } finally {
      setIsTriggeringResolution(false);
    }
  };

  async function handleDownloadAudit(format: AuditLogFormat) {
    setIsDownloadingAudit(true);
    try {
      await downloadSessionAuditLog(sessionCode, format);
    } catch {
      // el usuario puede reintentar
    } finally {
      setIsDownloadingAudit(false);
    }
  }

  return (
    <div className="flex w-full h-screen bg-[#020617] text-cyan-400 font-mono overflow-hidden">
      <div className="w-[380px] h-full bg-slate-900/40 border-r border-cyan-800/50 shadow-[4px_0_24px_-4px_rgba(6,182,212,0.15)] flex flex-col relative z-20 backdrop-blur-md">
        <div className="flex items-center gap-3 p-5 border-b border-cyan-800/50 bg-slate-900/60">
          <button
            type="button"
            onClick={isBoardActive ? openExitConfirm : () => navigate("/")}
            className="text-slate-500 hover:text-cyan-400 transition-colors p-2 rounded-md hover:bg-slate-800"
          >
            <ArrowLeft className="size-5" />
          </button>
          <MonitorPlay className="size-6 text-emerald-400" />
          <div className="flex-1">
            <h1 className="text-sm font-bold tracking-widest text-emerald-400">PANTALLA CENTRAL</h1>
            <p className="text-[10px] text-slate-500">{formatBoardHeaderSubtitle(presenceState?.status ?? null)}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsRulesOpen(true)}
            className="text-slate-500 hover:text-amber-400 transition-colors p-1"
            aria-label="Ver reglas"
          >
            <BookOpen className="size-4" />
          </button>
          {connectionStatus === "connecting" ? <LoaderCircle className="size-4 animate-spin text-cyan-300" /> : null}
        </div>

        <div className="flex-1 overflow-y-auto">
        <div className="p-6 border-b border-cyan-800/30 grid grid-cols-2 gap-4 bg-gradient-to-b from-cyan-950/10 to-transparent">
          <div className="flex flex-col gap-1 p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-inner shadow-slate-950/50">
            <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase"><KeyRound className="size-3" /> Codigo Sesion</span>
            <span className="text-xl font-mono font-bold tracking-widest text-emerald-400">{sessionCode}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-inner shadow-slate-950/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500"></div>
            <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase"><Clock className="size-3" /> Tiempo Restante</span>
            <span className={`text-xl font-bold font-mono tracking-widest ${timeRemaining < 300 ? "text-red-400 animate-pulse" : "text-cyan-400"}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
          <div className="col-span-2 rounded-lg border border-cyan-800/40 bg-cyan-950/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Turno actual</span>
                <p className="mt-2 text-xl font-black leading-tight text-cyan-100">
                  {presenceState?.status === "FINALIZADA"
                    ? latestAccusationEvent?.accusationVerdict?.outcome === "CORRECTA"
                      ? `Ganador: ${latestAccusationEvent.accusationVerdict.accuserTeamName}`
                      : "Partida finalizada"
                    : currentTurn?.currentTeamName ?? "Pendiente de sincronizar"}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${boardTurnStatusTone}`}>
                {boardTurnStatusLabel}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-cyan-800/60 bg-slate-950/60 p-3">
                <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Estado</span>
                <span className="mt-2 block text-sm font-black text-cyan-100">
                  {formatSessionStatusLabel(presenceState?.status ?? "EN_CURSO")}
                </span>
              </div>
              <div className="rounded-2xl border border-cyan-800/60 bg-slate-950/60 p-3 text-right">
                <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Dados</span>
                <span className="mt-2 block text-lg font-black text-emerald-300">
                  {presenceState?.status === "FINALIZADA"
                    ? "Partida cerrada"
                    : currentTurn?.dice
                    ? `${currentTurn.dice.valueOne} + ${currentTurn.dice.valueTwo} = ${currentTurn.dice.total}`
                    : "Sin tirar"}
                </span>
              </div>
            </div>
          </div>
          <div data-cy="board-session-controls" className="col-span-2 rounded-lg border border-cyan-800/40 bg-cyan-950/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Control de partida</span>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${boardControlStatusTone}`}>
                {formatSessionStatusLabel(presenceState?.status ?? "EN_CURSO")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${boardControlQuickTone}`}>
                {boardControlQuickLabel}
              </span>
            </div>
            {shouldShowGameControlButtons ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleGameStatus()}
                  disabled={connectionStatus !== "connected" || isChangingGameStatus || Boolean(activeResolution) || !canManageGameControls}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/70 bg-cyan-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {presenceState?.status === "PAUSADA" ? <Play className="size-4" /> : <Pause className="size-4" />}
                  {isChangingGameStatus
                    ? "Actualizando"
                    : presenceState?.status === "PAUSADA"
                    ? "Reanudar"
                    : "Pausar"}
                </button>
                <button
                  type="button"
                  data-cy="board-resolution-open"
                  onClick={() => setIsResolutionDialogOpen(true)}
                  disabled={!canOpenResolutionDialog || isTriggeringResolution}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-red-500/70 bg-red-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Flag className="size-4" />
                  {isTriggeringResolution ? "Abriendo..." : "Finalizar"}
                </button>
              </div>
            ) : null}
          </div>
          {activeResolution ? (
            <div data-cy="board-resolution-summary" className="col-span-2 rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-3">
              <span data-cy="board-resolution-phase" className="block text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
                {formatResolutionPhaseLabel(activeResolution.phase)}
              </span>
              <p data-cy="board-resolution-detail" className="mt-1 text-sm font-semibold text-amber-50">
                {activeResolution.phase === "ESPERANDO_RESOLUCION"
                  ? `${formatResolutionModeLabel(activeResolution.mode)} activa. ${resolutionSubmittedCount}/${resolutionEligibleCount} acusaciones recibidas.`
                  : buildCompletedResolutionSummary(activeResolution.mode)}
              </p>
              {activeResolution.phase === "ESPERANDO_RESOLUCION" && resolutionCountdownSeconds !== null ? (
                <div
                  data-cy="board-resolution-countdown"
                  className={`mt-3 rounded-2xl border px-4 py-3 ${
                    resolutionCountdownSeconds === 0
                      ? "border-red-700/60 bg-red-950/25"
                      : "border-amber-700/60 bg-amber-950/25"
                  }`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">
                    Tiempo restante para la acusación final
                  </span>
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-amber-100/80">
                      {resolutionCountdownSeconds === 0 ? "Cerrando la fase de resolución..." : "La solución se mostrará al agotarse el reloj."}
                    </p>
                    <span
                      className={`text-3xl font-black font-mono tracking-[0.18em] ${
                        resolutionCountdownSeconds === 0 ? "text-red-300" : "text-amber-50"
                      }`}
                    >
                      {formatTime(resolutionCountdownSeconds)}
                    </span>
                  </div>
                </div>
              ) : null}
              {activeResolution.solution ? (
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-amber-50">
                  <div data-cy="board-resolution-solution-subject" className="rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2">
                    <span className="block text-[9px] uppercase tracking-[0.18em] text-amber-200/70">Sujeto</span>
                    {activeResolution.solution.subject.name}
                  </div>
                  <div data-cy="board-resolution-solution-object" className="rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2">
                    <span className="block text-[9px] uppercase tracking-[0.18em] text-amber-200/70">Objeto</span>
                    {activeResolution.solution.object.name}
                  </div>
                  <div data-cy="board-resolution-solution-space" className="rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2">
                    <span className="block text-[9px] uppercase tracking-[0.18em] text-amber-200/70">Espacio</span>
                    {activeResolution.solution.space.name}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {latestAccusationEvent?.accusationVerdict ? (
            <div className="col-span-2 rounded-lg border border-red-700/50 bg-red-950/20 px-4 py-3">
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-red-200">
                Veredicto de acusación final
              </span>
              <p className="mt-1 text-sm font-semibold text-red-50">{latestAccusationEvent.message}</p>
            </div>
          ) : null}
        </div>

        {boardError ? (
          <div className="mx-6 mt-4 rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">
            {boardError}
          </div>
        ) : null}

        <div className="px-6 py-4 border-b border-cyan-800/30">
          <h3 className="text-xs uppercase text-cyan-600 mb-4 flex items-center gap-2 font-bold tracking-widest">
            <Users className="size-4" /> Equipos Conectados
          </h3>
          <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest">
            <span className="rounded-full border border-cyan-900/60 bg-cyan-950/20 px-3 py-1 text-cyan-200">Conectados {connectedCount}</span>
            <span className="rounded-full border border-amber-900/60 bg-amber-950/20 px-3 py-1 text-amber-200">Inactivos {inactiveCount}</span>
            <span className="rounded-full border border-red-900/60 bg-red-950/20 px-3 py-1 text-red-200">Sin senal {disconnectedCount}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {teamSlots.map((team) => {
              const cardClass =
                team.status === "connected"
                  ? "border-cyan-500 bg-cyan-950/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                  : team.status === "inactive"
                  ? "border-amber-500/40 bg-amber-950/10"
                  : team.status === "disconnected"
                  ? "border-red-500/40 bg-red-950/10"
                  : "border-slate-800 bg-slate-900/50 opacity-70";

              return (
                <div key={team.color} className={`flex items-center gap-2 p-2 rounded border transition-all ${cardClass}`}>
                  <div className="size-3 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.2)]" style={{ backgroundColor: team.hexColor }}></div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-200 truncate">{team.team?.name ?? team.label}</span>
                    <span className="text-[9px] text-slate-500 truncate" title={team.location}>{team.secondaryText}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">{team.statusLabel}</span>
                    {team.status === "connected" ? <Activity className="size-3 text-cyan-400 animate-pulse" /> : null}
                    {team.status === "inactive" ? <Activity className="size-3 text-amber-300" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {presenceState && presenceState.publicCards.length > 0 ? (
          <div className="px-6 py-4 border-b border-cyan-800/30">
            <EvidenciasComunes publicCards={presenceState.publicCards} />
          </div>
        ) : null}

        <div className="p-6 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-slate-900 to-[#020617]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs uppercase text-cyan-600 flex items-center gap-2 font-bold tracking-widest">
              <History className="size-4" /> Registro de Partida
            </h3>
            <RefreshCw className={`size-3 text-cyan-800 ${connectionStatus === "connecting" ? "animate-spin" : ""}`} />
          </div>
          <div className="space-y-3 pr-2">
            {visibleEvents.map((event) => {
              const eventClass =
                event.type === "team-disconnected"
                  ? "bg-red-950/20 border-red-900/50 text-red-300"
                  : event.type === "final-accusation-verdict"
                  ? "bg-red-950/20 border-red-700/50 text-red-50"
                  : event.type === "team-connected"
                  ? "bg-cyan-950/10 border-cyan-900/30 text-cyan-100"
                  : "bg-slate-900/50 border-slate-800 text-slate-400 font-bold";

              return (
                <m.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={event.id}
                  className={`p-3 rounded border text-xs leading-relaxed font-light ${eventClass}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] opacity-60 font-mono">{formatEventTime(event.occurredAt)}</span>
                  </div>
                  {event.message}
                </m.div>
              );
            })}
          </div>
        </div>
        {presenceState?.status === "FINALIZADA" && (isBoardSolutionVisible || !showGameOverModal) ? (
          <div className="px-6 py-4">
            <h3 className="text-xs uppercase text-cyan-600 mb-3 flex items-center gap-2 font-bold tracking-widest">
              <Download className="size-4" /> Exportar Registro
            </h3>
            <p className="mb-3 text-[10px] text-slate-500 leading-relaxed">
              Historial completo de eventos de la partida: movimientos, sugerencias, refutaciones y acusaciones.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleDownloadAudit('json')}
                disabled={isDownloadingAudit}
                className="flex-1 rounded-lg border border-cyan-700/50 bg-cyan-950/40 py-2.5 text-[10px] font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Descargar como JSON
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadAudit('csv')}
                disabled={isDownloadingAudit}
                className="flex-1 rounded-lg border border-emerald-700/50 bg-emerald-950/40 py-2.5 text-[10px] font-bold uppercase tracking-widest text-emerald-200 hover:bg-emerald-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Descargar como CSV
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </div>

      <div className="flex-1 relative bg-[#020617] flex items-center justify-center p-8 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCA0MGg0MHYtMUgwem0zOSAwSDQwaC0xdjQwSDB6IiBmaWxsPSJyZ2JhKDMsIDEwNSwgMTYxLCAwLjA1KSIvPgo8L3N2Zz4=')] z-0"></div>

        <div className="relative z-10 w-full max-w-5xl aspect-square bg-[#380b0b] rounded-xl shadow-[0_0_60px_-10px_rgba(0,0,0,1)] border-4 border-slate-800 p-2 flex items-center justify-center">
          <ThemedBoard
            boardAlt="Tablero de partida"
            centerImage={boardCenterImage}
            centerImageAlt=""
            spaces={boardSpaces}
            showDebugOverlay={isBoardDebugEnabled}
            debugProbe={boardDebugProbe}
            spaceNameScale={1.45}
            spaceMotifScale={1.2}
            teams={boardPawns}
            dataCy="host-themed-board"
            onSpaceMotifClick={setActiveMotifSpace}
          >
            {isBoardDebugEnabled ? (
              <button
                type="button"
                data-cy="host-board-debug-surface"
                aria-label="Superficie de depuración del tablero"
                className="absolute inset-0 z-20 cursor-crosshair"
                onClick={handleBoardDebugSurfaceClick}
              />
            ) : null}
            <SpaceMotifModal
              space={activeMotifSpace}
              onClose={() => setActiveMotifSpace(null)}
            />
          </ThemedBoard>

          {isBoardSolutionVisible && activeResolution?.solution ? (
            <m.div
              key={`board-solution-${activeResolution.mode}`}
              data-cy="board-solution-reveal"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 z-40 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(2,6,23,0.7),rgba(2,6,23,0.95)_70%)] p-6 backdrop-blur-[5px]"
            >
              <div className="w-full max-w-[40rem] rounded-[28px] border border-amber-400/50 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-6 shadow-[0_30px_100px_rgba(2,6,23,0.82)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    data-cy="board-solution-session-status"
                    className="rounded-full border border-amber-400/40 bg-amber-950/35 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100"
                  >
                    Sesión cerrada · FINALIZADA
                  </span>
                  <div className="rounded-full border border-cyan-400/25 bg-cyan-950/30 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100">
                    {activeResolution.winningTeams.length === 0
                      ? "Sin ganadores"
                      : activeResolution.winningTeams.length === 1
                      ? `Ganador: ${activeResolution.winningTeams[0]?.name ?? "Sin determinar"}`
                      : `Ganadores: ${activeResolution.winningTeams.map((team) => team.name).join(", ")}`}
                  </div>
                </div>

                <div className="mt-5">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-amber-300">
                      {activeResolution.mode === "FINAL_CHANCE" ? "Resolución final" : "Solución revelada"}
                    </p>
                    <h3 className="mt-2 text-3xl font-black uppercase tracking-[0.14em] text-white">
                      Caso cerrado
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-200">
                      La sesión ha quedado cerrada. Estas son las tres cartas que resuelven el sobre final.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {boardSolutionCards.map((item, index) => (
                    <m.div
                      key={item.key}
                      data-cy={`board-solution-card-${item.key}`}
                      initial={{ opacity: 0, y: 28, rotateX: -12 }}
                      animate={{ opacity: 1, y: 0, rotateX: 0 }}
                      transition={{ delay: index * 0.12, duration: 0.38 }}
                      className={`overflow-hidden rounded-[22px] border bg-slate-900/96 ${item.tone}`}
                    >
                      <div className="relative aspect-[4/5] w-full overflow-hidden border-b border-white/10 bg-slate-950/90">
                        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.92),rgba(2,6,23,1))]">
                          {item.key === "subject" ? (
                            <User className="size-12 text-cyan-200/70" />
                          ) : item.key === "object" ? (
                            <Box className="size-12 text-emerald-200/70" />
                          ) : (
                            <MapPin className="size-12 text-rose-200/70" />
                          )}
                        </div>
                        {item.imageUrl ? (
                          <>
                            <img
                              data-cy={`board-solution-card-image-${item.key}`}
                              src={item.imageUrl}
                              alt=""
                              aria-hidden="true"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                              className="h-full w-full object-cover opacity-95"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
                          </>
                        ) : (
                          <div
                            data-cy={`board-solution-card-fallback-${item.key}`}
                            className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.98),rgba(2,6,23,1))]"
                          >
                            {item.key === "subject" ? (
                              <User className="size-12 text-cyan-200/80" />
                            ) : item.key === "object" ? (
                              <Box className="size-12 text-emerald-200/80" />
                            ) : (
                              <MapPin className="size-12 text-rose-200/80" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-4 text-left">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.26em] opacity-75">{item.label}</span>
                        <p className="mt-3 text-2xl font-black leading-[1.05] text-white break-words">{item.name}</p>
                      </div>
                    </m.div>
                  ))}
                </div>
              </div>
            </m.div>
          ) : null}

          {import.meta.env.DEV && !isBoardSolutionVisible ? (
            <button
              type="button"
              data-cy="host-board-debug-toggle"
              onClick={handleBoardDebugToggle}
              className={`absolute right-4 top-4 z-30 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] shadow-[0_0_10px_rgba(0,0,0,0.35)] ${isBoardDebugEnabled ? 'border-fuchsia-400/70 bg-fuchsia-950/75 text-fuchsia-100' : 'border-cyan-900/60 bg-slate-950/85 text-cyan-200'}`}
              title="Activa la rejilla y los nodos del tablero para ajustar el mapa"
            >
              {isBoardDebugEnabled ? 'Debug on' : 'Debug off'}
            </button>
          ) : null}

          <div className="absolute top-0 left-0 size-8 border-t-2 border-l-2 border-cyan-800/70 -translate-x-2 -translate-y-2"></div>
          <div className="absolute top-0 right-0 size-8 border-t-2 border-r-2 border-cyan-800/70 translate-x-2 -translate-y-2"></div>
          <div className="absolute bottom-0 left-0 size-8 border-b-2 border-l-2 border-cyan-800/70 -translate-x-2 translate-y-2"></div>
          <div className="absolute bottom-0 right-0 size-8 border-b-2 border-r-2 border-cyan-800/70 translate-x-2 translate-y-2"></div>
        </div>

        {showEnvelopeAnimation ? (
          <EnvelopeAnimation onComplete={() => setShowEnvelopeAnimation(false)} />
        ) : null}
      </div>

      <RulesModal open={isRulesOpen} onClose={() => setIsRulesOpen(false)} role="gm" />

      {!isBoardSolutionVisible ? (
        <GameOverModal
          open={showGameOverModal}
          onClose={() => setShowGameOverModal(false)}
          winner={gameOverWinner}
          solution={gameOverSolution}
          accessCode={sessionCode}
        />
      ) : null}

      <AlertDialog open={showExitConfirm} onOpenChange={(open) => { if (!open) cancelExit(); }}>
        <AlertDialogContent className="max-w-sm border-red-900/60 bg-slate-950 text-cyan-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-[0.18em] text-red-300">
              ¿Finalizar la partida?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-300">
              La sesión se cerrará para todos los participantes. Esta acción es irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              onClick={cancelExit}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 text-slate-100 hover:bg-red-600"
              onClick={() => {
                const socket = socketRef.current;
                const sid = presenceState?.sessionId;
                const doExit = async () => {
                  if (socket && sid) {
                    await endSessionFromBoard(socket, sid).catch(() => {});
                  }
                  socket?.disconnect();
                  navigate("/");
                };
                void doExit();
              }}
            >
              Finalizar partida
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isResolutionDialogOpen} onOpenChange={setIsResolutionDialogOpen}>
        <AlertDialogContent data-cy="board-resolution-dialog" className="max-w-md border-cyan-900/60 bg-slate-950 text-cyan-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">
              Panel de decisión de resolución
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-300">
              Elige si quieres revelar inmediatamente la solución o abrir la última oportunidad para todos los equipos activos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              data-cy="board-resolution-direct"
              onClick={() => void handleTriggerResolution("DIRECT_REVEAL")}
              disabled={isTriggeringResolution}
              className="rounded-md border border-red-500/70 bg-red-500 px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Revelar solución directamente
            </button>
            <button
              type="button"
              data-cy="board-resolution-final-chance"
              onClick={() => void handleTriggerResolution("FINAL_CHANCE")}
              disabled={isTriggeringResolution}
              className="rounded-md border border-amber-500/70 bg-amber-500 px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Habilitar acusación final
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white">
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function mergeLobbySessionIntoPresence(
  currentState: LobbyPresenceState | null,
  session: LobbySession,
  occurredAt: number
) {
  if (!currentState || currentState.sessionId !== session.id) {
    return currentState;
  }

  return {
    ...currentState,
    accessCode: session.accessCode,
    status: session.status,
    startedAt: session.startedAt,
    durationSeconds: session.durationSeconds,
    remainingSeconds: session.remainingSeconds,
    turn: session.turn,
    activeSuggestion: session.activeSuggestion,
    resolution: session.resolution,
    publicCards: session.publicCards,
    teams: session.teams.map((team) => {
      const previousTeam = currentState.teams.find((currentTeam) => currentTeam.id === team.id);

      return {
        ...team,
        connected: previousTeam?.connected ?? false,
        lastSeenAt: previousTeam?.lastSeenAt ?? null,
      };
    }),
    updatedAt: occurredAt,
  };
}

async function resolveSessionId() {
  const storedSessionId = getStoredSessionId();
  if (storedSessionId) {
    return storedSessionId;
  }

  const storedSessionCode = getStoredSessionCode();
  if (!storedSessionCode) {
    return null;
  }

  const session = await getGameSession(storedSessionCode);
  storeHostLobbySession(session);
  return session.id;
}

function calculateRemainingSeconds(startedAt: string | null, durationSeconds: number) {
  if (!durationSeconds) {
    return 0;
  }

  if (!startedAt) {
    return durationSeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  return Math.max(0, durationSeconds - elapsedSeconds);
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatEventTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getResolutionCountdownSeconds(deadlineAt: string | null | undefined, currentTimestamp: number) {
  if (!deadlineAt) {
    return null;
  }

  const deadlineTimestamp = new Date(deadlineAt).getTime();

  if (Number.isNaN(deadlineTimestamp)) {
    return null;
  }

  return Math.max(0, Math.ceil((deadlineTimestamp - currentTimestamp) / 1000));
}

function formatSessionStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formatBoardHeaderSubtitle(status: string | null) {
  if (!status) {
    return "SINCRONIZANDO PARTIDA";
  }

  return `PARTIDA ${formatSessionStatusLabel(status)}`;
}

function formatResolutionModeLabel(mode: GameResolutionMode) {
  return mode === "FINAL_CHANCE" ? "Última oportunidad" : "Revelado directo";
}

function buildCompletedResolutionSummary(mode: GameResolutionMode) {
  return mode === "DIRECT_REVEAL"
    ? "Revelado directo completado. La solución ya está visible para toda la mesa."
    : "Última oportunidad completada. La solución ya está visible para toda la mesa.";
}

function buildBoardResolutionCards(
  solution: NonNullable<NonNullable<LobbySession["resolution"]>["solution"]>,
  boardConfig: StoredBoardConfig | null
) {
  return [
    {
      key: "subject" as const,
      label: boardConfig?.cat1Name?.trim() || "Sujeto",
      card: solution.subject,
      item: findStoredBoardResolutionItem(boardConfig?.subjects, solution.subject),
      tone: "border-cyan-400/45 text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,0.14)]",
    },
    {
      key: "object" as const,
      label: boardConfig?.cat2Name?.trim() || "Objeto",
      card: solution.object,
      item: findStoredBoardResolutionItem(boardConfig?.objects, solution.object),
      tone: "border-emerald-400/45 text-emerald-100 shadow-[0_0_26px_rgba(16,185,129,0.14)]",
    },
    {
      key: "space" as const,
      label: boardConfig?.cat3Name?.trim() || "Espacio",
      card: solution.space,
      item: findStoredBoardResolutionItem(boardConfig?.spaces, solution.space),
      tone: "border-rose-400/45 text-rose-100 shadow-[0_0_26px_rgba(244,63,94,0.14)]",
    },
  ].map((item) => ({
    key: item.key,
    label: item.label,
    name: item.item?.name ?? item.card.name,
    imageUrl: item.item?.imageUrl,
    tone: item.tone,
  }));
}

function findStoredBoardResolutionItem(items: StoredBoardItem[] | undefined, card: ResolutionCard) {
  if (!items?.length) {
    return null;
  }

  const normalizedCardName = normalizeBoardResolutionLookup(card.name);

  return (
    items.find((item) => item.id === card.id) ??
    items.find((item) => normalizeBoardResolutionLookup(item.name) === normalizedCardName) ??
    null
  );
}

function normalizeBoardResolutionLookup(value: string) {
  return value.trim().toLocaleLowerCase("es-ES");
}

function formatResolutionPhaseLabel(phase: "ESPERANDO_RESOLUCION" | "MOSTRANDO_SOLUCION") {
  return phase === "ESPERANDO_RESOLUCION" ? "Resolución en curso" : "Solución proyectada";
}

function getRenderableBoardCenterImage(centerImage: string | null | undefined) {
  const normalizedCenterImage = centerImage?.trim();

  if (!normalizedCenterImage || isCenterImageIndicator(normalizedCenterImage)) {
    return undefined;
  }

  return normalizedCenterImage;
}

function isCenterImageIndicator(centerImage: string) {
  return (
    centerImage.startsWith("data:image/svg+xml") &&
    centerImage.includes('cx="60" cy="60" r="30"') &&
    centerImage.includes('d="M42 60h36"') &&
    centerImage.includes('stroke-linecap="round"')
  );
}

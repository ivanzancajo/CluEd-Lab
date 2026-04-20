import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  Clock,
  History,
  KeyRound,
  LoaderCircle,
  MonitorPlay,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  createLobbySocketClient,
  subscribeHostToLobby,
  type LobbyEventMessage,
  type LobbyPresenceState,
} from "../../src/lib/lobbySocket";
import {
  getStoredSessionCode,
  getStoredSessionDurationSeconds,
  getStoredSessionId,
  getStoredSessionStartedAt,
  storeHostLobbySession,
} from "../../src/lib/lobbyStorage";
import { getTeamMonitoringLabel, getTeamMonitoringStatus } from "../../src/lib/teamMonitoring";
import { TEAM_METADATA } from "../../src/lib/teamMeta";
import { getGameSession, getSessionErrorMessage } from "../../src/lib/sessionApi";

const boardImg = "/board-placeholder.svg";

type BoardConnectionStatus = "idle" | "connecting" | "connected" | "error";
type TeamSlotStatus = "free" | "connected" | "inactive" | "disconnected";

export function BoardView() {
  const navigate = useNavigate();
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [sessionCode, setSessionCode] = useState("");
  const [centerImage, setCenterImage] = useState("");
  const [presenceState, setPresenceState] = useState<LobbyPresenceState | null>(null);
  const [events, setEvents] = useState<LobbyEventMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<BoardConnectionStatus>("idle");
  const [boardError, setBoardError] = useState<string | null>(null);
  const [monitoringNow, setMonitoringNow] = useState(() => Date.now());

  useEffect(() => {
    setSessionCode(getStoredSessionCode() || "N/A");
    setCenterImage(localStorage.getItem("centerImage") || "");
    setTimeRemaining(
      calculateRemainingSeconds(getStoredSessionStartedAt(), getStoredSessionDurationSeconds() ?? 0)
    );
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setMonitoringNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!presenceState) {
      return;
    }

    if (presenceState.status === "LOBBY") {
      navigate("/lobby", { replace: true });
      return;
    }

    const updateTimeRemaining = () => {
      setTimeRemaining(calculateRemainingSeconds(presenceState.startedAt, presenceState.durationSeconds));
    };

    updateTimeRemaining();
    const timer = window.setInterval(updateTimeRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [navigate, presenceState]);

  useEffect(() => {
    let active = true;
    const socket = createLobbySocketClient({ admin: true });

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
      socket.disconnect();
    };
  }, [navigate]);

  const monitoredTeams = presenceState?.teams ?? [];
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

  return (
    <div className="flex w-full h-screen bg-[#020617] text-cyan-400 font-mono overflow-hidden">
      <div className="w-[380px] h-full bg-slate-900/40 border-r border-cyan-800/50 shadow-[4px_0_24px_-4px_rgba(6,182,212,0.15)] flex flex-col relative z-20 backdrop-blur-md">
        <div className="flex items-center gap-3 p-5 border-b border-cyan-800/50 bg-slate-900/60">
          <Link to="/" className="text-slate-500 hover:text-cyan-400 transition-colors p-2 rounded-md hover:bg-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <MonitorPlay className="w-6 h-6 text-emerald-400" />
          <div className="flex-1">
            <h1 className="text-sm font-bold tracking-widest text-emerald-400">PANTALLA CENTRAL</h1>
            <p className="text-[10px] text-slate-500">PARTIDA EN CURSO</p>
          </div>
          {connectionStatus === "connecting" ? <LoaderCircle className="w-4 h-4 animate-spin text-cyan-300" /> : null}
        </div>

        <div className="p-6 border-b border-cyan-800/30 grid grid-cols-2 gap-4 bg-gradient-to-b from-cyan-950/10 to-transparent">
          <div className="flex flex-col gap-1 p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-inner shadow-slate-950/50">
            <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase"><KeyRound className="w-3 h-3" /> Codigo Sesion</span>
            <span className="text-xl font-mono font-bold tracking-widest text-emerald-400">{sessionCode}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-inner shadow-slate-950/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500"></div>
            <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase"><Clock className="w-3 h-3" /> Tiempo Restante</span>
            <span className={`text-xl font-bold font-mono tracking-widest ${timeRemaining < 300 ? "text-red-400 animate-pulse" : "text-cyan-400"}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>

        {boardError ? (
          <div className="mx-6 mt-4 rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">
            {boardError}
          </div>
        ) : null}

        <div className="px-6 py-4 border-b border-cyan-800/30">
          <h3 className="text-xs uppercase text-cyan-600 mb-4 flex items-center gap-2 font-bold tracking-widest">
            <Users className="w-4 h-4" /> Equipos Conectados
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
                  <div className="w-3 h-3 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.2)]" style={{ backgroundColor: team.hexColor }}></div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-200 truncate">{team.team?.name ?? team.label}</span>
                    <span className="text-[9px] text-slate-500 truncate" title={team.location}>{team.secondaryText}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">{team.statusLabel}</span>
                    {team.status === "connected" ? <Activity className="w-3 h-3 text-cyan-400 animate-pulse" /> : null}
                    {team.status === "inactive" ? <Activity className="w-3 h-3 text-amber-300" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-slate-900 to-[#020617]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs uppercase text-cyan-600 flex items-center gap-2 font-bold tracking-widest">
              <History className="w-4 h-4" /> Registro de Partida
            </h3>
            <RefreshCw className={`w-3 h-3 text-cyan-800 ${connectionStatus === "connecting" ? "animate-spin" : ""}`} />
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-transparent">
            {visibleEvents.map((event) => {
              const eventClass =
                event.type === "team-disconnected"
                  ? "bg-red-950/20 border-red-900/50 text-red-300"
                  : event.type === "team-connected"
                  ? "bg-cyan-950/10 border-cyan-900/30 text-cyan-100"
                  : "bg-slate-900/50 border-slate-800 text-slate-400 font-bold";

              return (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={event.id}
                  className={`p-3 rounded border text-xs leading-relaxed font-light ${eventClass}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] opacity-60 font-mono">{formatEventTime(event.occurredAt)}</span>
                  </div>
                  {event.message}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 relative bg-[#020617] flex items-center justify-center p-8 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCA0MGg0MHYtMUgwem0zOSAwSDQwaC0xdjQwSDB6IiBmaWxsPSJyZ2JhKDMsIDEwNSwgMTYxLCAwLjA1KSIvPgo8L3N2Zz4=')] z-0"></div>

        <div className="relative z-10 w-full max-w-5xl aspect-square bg-[#380b0b] rounded-xl shadow-[0_0_60px_-10px_rgba(0,0,0,1)] border-4 border-slate-800 p-2 flex items-center justify-center">
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-[#5c1a1a]">
            <img src={boardImg} alt="Tablero de partida" className="w-full h-full object-contain" />

            {centerImage ? (
              <div className="absolute top-[48%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] pointer-events-none z-10 flex items-center justify-center">
                <img src={centerImage} alt="Center Logo" className="max-w-full max-h-full object-contain drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]" />
              </div>
            ) : null}

            {teamSlots.map((team) => {
              const isJoined = team.status !== "free";
              const pawnOpacity = team.status === "connected" ? 1 : team.status === "inactive" ? 0.7 : team.status === "disconnected" ? 0.35 : 0.15;

              return (
                <motion.div
                  key={team.color}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, opacity: pawnOpacity }}
                  transition={{ type: "spring", stiffness: 200, damping: 10 }}
                  className="absolute w-8 h-8 md:w-10 md:h-10 rounded-full border-[3px] border-slate-900 shadow-[0_0_15px_rgba(0,0,0,0.8)] z-20 flex items-center justify-center"
                  style={{
                    backgroundColor: isJoined ? team.hexColor : "transparent",
                    borderColor: team.hexColor,
                    top: team.position.top,
                    left: team.position.left,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <div className={`rounded-full ${isJoined ? "w-1/2 h-1/2 bg-white/30 backdrop-blur-sm" : "w-3 h-3 border border-current opacity-70"}`}></div>
                </motion.div>
              );
            })}
          </div>

          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-800 -translate-x-4 -translate-y-4"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-800 translate-x-4 -translate-y-4"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-800 -translate-x-4 translate-y-4"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-800 translate-x-4 translate-y-4"></div>
        </div>
      </div>
    </div>
  );
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

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  History,
  KeyRound,
  LoaderCircle,
  Play,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import {
  createLobbySocketClient,
  subscribeHostToLobby,
  type LobbyEventMessage,
  type LobbyPresenceState,
} from "../../src/lib/lobbySocket";
import { getStoredSessionCode, getStoredSessionId, storeHostLobbySession } from "../../src/lib/lobbyStorage";
import { TEAM_METADATA } from "../../src/lib/teamMeta";
import { getGameSession, getSessionErrorMessage, startGameSession } from "../../src/lib/sessionApi";

type LobbyConnectionStatus = "idle" | "connecting" | "connected" | "error";

export function LobbyView() {
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState("");
  const [presenceState, setPresenceState] = useState<LobbyPresenceState | null>(null);
  const [events, setEvents] = useState<LobbyEventMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<LobbyConnectionStatus>("idle");
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [isStartingGame, setIsStartingGame] = useState(false);

  useEffect(() => {
    setSessionCode(getStoredSessionCode() || "N/A");
  }, []);

  useEffect(() => {
    let active = true;
    const socket = createLobbySocketClient({ admin: true });

    const applyPresenceState = (state: LobbyPresenceState) => {
      if (!active) {
        return;
      }

      if (state.status !== "LOBBY") {
        navigate("/board", { replace: true });
        return;
      }

      setPresenceState(state);
      setSessionCode(state.accessCode);
      setLobbyError(null);
      setConnectionStatus("connected");
    };

    const connectHostToLobby = async () => {
      setConnectionStatus("connecting");
      setLobbyError(null);

      try {
        const resolvedSessionId = await resolveSessionId();

        if (!active) {
          return;
        }

        if (!resolvedSessionId) {
          throw new Error("No hay una partida habilitada para la sala de espera.");
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
          setLobbyError("No se ha podido conectar la sala de espera con el servicio realtime.");
        });
        socket.on("connect", async () => {
          const response = await subscribeHostToLobby(socket, resolvedSessionId);

          if (!active) {
            return;
          }

          if (!response.ok) {
            setConnectionStatus("error");
            setLobbyError(response.error);
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
        setLobbyError(
          error instanceof Error
            ? error.message
            : getSessionErrorMessage(error, "No se ha podido cargar la sesión activa de la sala de espera.")
        );
      }
    };

    connectHostToLobby();

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [navigate]);

  const handleStartGame = async () => {
    if (!sessionCode || sessionCode === "N/A") {
      setLobbyError("No hay un código de partida activo para iniciar la sesión.");
      return;
    }

    try {
      setIsStartingGame(true);
      setLobbyError(null);

      const session = await startGameSession(sessionCode);
      storeHostLobbySession(session);
      navigate("/board");
    } catch (error) {
      setLobbyError(getSessionErrorMessage(error, "No se ha podido iniciar la partida."));
    } finally {
      setIsStartingGame(false);
    }
  };

  const teamSlots = TEAM_METADATA.map((teamMeta) => {
    const joinedTeam = presenceState?.teams.find((team) => team.color === teamMeta.color) ?? null;
    const teamStatus = !joinedTeam ? "free" : joinedTeam.connected ? "connected" : "joined";

    return {
      ...teamMeta,
      team: joinedTeam,
      status: teamStatus,
    };
  });

  const joinedCount = presenceState?.teams.length ?? 0;
  const connectedCount = presenceState?.teams.filter((team) => team.connected).length ?? 0;
  const availableCount = TEAM_METADATA.length - joinedCount;
  const visibleEvents =
    events.length > 0
      ? events
      : [
          {
            id: "waiting-room",
            type: "system" as const,
            message:
              connectionStatus === "connected"
                ? "Sala de espera operativa. Compartiendo el codigo con los equipos."
                : "Conectando la sala de espera con el servicio realtime...",
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
          <RadioTower className="w-6 h-6 text-amber-400" />
          <div className="flex-1">
            <h1 className="text-sm font-bold tracking-widest text-amber-300">SALA DE ESPERA</h1>
            <p className="text-[10px] text-slate-500">HOST CONTROL ROOM</p>
          </div>
          {connectionStatus === "connecting" ? <LoaderCircle className="w-4 h-4 animate-spin text-cyan-300" /> : null}
        </div>

        <div className="p-6 border-b border-cyan-800/30 grid grid-cols-2 gap-4 bg-gradient-to-b from-amber-950/10 to-transparent">
          <div className="flex flex-col gap-1 p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-inner shadow-slate-950/50">
            <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase"><KeyRound className="w-3 h-3" /> Codigo Sesion</span>
            <span className="text-xl font-mono font-bold tracking-widest text-emerald-400">{sessionCode}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-inner shadow-slate-950/50">
            <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase"><Users className="w-3 h-3" /> Equipos Listos</span>
            <span className="text-xl font-bold font-mono tracking-widest text-cyan-300">{connectedCount}/{joinedCount}</span>
          </div>
        </div>

        {lobbyError ? (
          <div className="mx-6 mt-4 rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">
            {lobbyError}
          </div>
        ) : null}

        <div className="px-6 py-4 border-b border-cyan-800/30">
          <h3 className="text-xs uppercase text-cyan-600 mb-4 flex items-center gap-2 font-bold tracking-widest">
            <Users className="w-4 h-4" /> Equipos del Lobby
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {teamSlots.map((team) => {
              const cardClass =
                team.status === "connected"
                  ? "border-cyan-500 bg-cyan-950/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                  : team.status === "joined"
                  ? "border-amber-500/40 bg-amber-950/10"
                  : "border-slate-800 bg-slate-900/50 opacity-70";

              const secondaryText =
                team.status === "connected"
                  ? "Terminal conectado"
                  : team.status === "joined"
                  ? "Equipo unido sin terminal"
                  : "Color disponible";

              return (
                <div key={team.color} className={`flex items-center gap-2 p-2 rounded border transition-all ${cardClass}`}>
                  <div className="w-3 h-3 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.2)]" style={{ backgroundColor: team.hexColor }}></div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-200 truncate">{team.team?.name ?? team.label}</span>
                    <span className="text-[9px] text-slate-500 truncate" title={team.location}>{secondaryText}</span>
                  </div>
                  {team.status === "connected" ? <Activity className="w-3 h-3 text-cyan-400 animate-pulse" /> : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-slate-900 to-[#020617]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs uppercase text-cyan-600 flex items-center gap-2 font-bold tracking-widest">
              <History className="w-4 h-4" /> Registro del Lobby
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

      <div className="flex-1 relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.14),_transparent_28%),linear-gradient(180deg,#020617_0%,#020617_48%,#000000_100%)]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCA0MGg0MHYtMUgwem0zOSAwSDQwaC0xdjQwSDB6IiBmaWxsPSJyZ2JhKDI0NSwgMTU4LCAxMSwgMC4wNikiLz4KPC9zdmc+')] opacity-40"></div>
        <div className="relative z-10 flex h-full items-center justify-center p-8">
          <div className="w-full max-w-4xl rounded-[32px] border border-amber-700/30 bg-slate-950/70 p-10 shadow-[0_0_60px_-20px_rgba(245,158,11,0.25)] backdrop-blur-md">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-800/60 bg-amber-950/20 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.32em] text-amber-200/90">
                  <ShieldCheck className="w-4 h-4" /> Lobby habilitado
                </div>
                <h2 className="text-4xl font-black uppercase tracking-tight text-white">Esperando a los equipos</h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                  La partida ya tiene codigo de acceso, pero la pantalla central sigue oculta. Comparte el codigo con los jugadores y lanza la partida solo cuando esten listos.
                </p>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Unidos</p>
                    <p className="mt-3 text-3xl font-black text-white">{joinedCount}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Conectados</p>
                    <p className="mt-3 text-3xl font-black text-cyan-300">{connectedCount}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Disponibles</p>
                    <p className="mt-3 text-3xl font-black text-emerald-300">{availableCount}</p>
                  </div>
                </div>
              </div>

              <div className="w-full max-w-md rounded-[28px] border border-cyan-900/50 bg-slate-900/80 p-6 shadow-inner shadow-slate-950/60">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-cyan-900/50 bg-cyan-950/20 p-4">
                    <Zap className="w-7 h-7 text-cyan-300" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-500">Codigo activo</p>
                    <p className="mt-1 text-3xl font-black tracking-[0.22em] text-emerald-400">{sessionCode}</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-amber-900/40 bg-amber-950/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  Al pulsar Iniciar Partida se cerrara el acceso de nuevos equipos, se mostrara la pantalla central y comenzara a correr el tiempo.
                </div>

                <button
                  type="button"
                  onClick={handleStartGame}
                  disabled={isStartingGame || !sessionCode || sessionCode === "N/A"}
                  className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-6 py-5 text-lg font-black uppercase tracking-[0.24em] text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.28)] transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                >
                  {isStartingGame ? <LoaderCircle className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" />}
                  {isStartingGame ? "Iniciando..." : "Iniciar Partida"}
                </button>
              </div>
            </div>
          </div>
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

function formatEventTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

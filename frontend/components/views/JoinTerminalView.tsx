import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, KeyRound, LoaderCircle, MonitorSmartphone, ShieldAlert, Cpu } from "lucide-react";
import { clearStoredTeamContext, getStoredJoinedLobbyContext, storeJoinedLobbySession } from "../../src/lib/lobbyStorage";
import { TEAM_METADATA } from "../../src/lib/teamMeta";
import {
  getGameSession,
  getSessionErrorMessage,
  joinGameSession,
  type LobbySession,
  type TeamColor,
} from "../../src/lib/sessionApi";

export function JoinTerminalView() {
  const [code, setCode] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<TeamColor | "">("");
  const [sessionSnapshot, setSessionSnapshot] = useState<LobbySession | null>(null);
  const [resumeTeamId, setResumeTeamId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (code.length !== 6) {
      setSessionSnapshot(null);
      setSelectedTeam("");
      setResumeTeamId(null);
      setJoinError(null);
      setIsLoadingSession(false);
      return;
    }

    let cancelled = false;

    setIsLoadingSession(true);
    setJoinError(null);

    getGameSession(code)
      .then((session) => {
        if (cancelled) {
          return;
        }

        setSessionSnapshot(session);
        const storedContext = getStoredJoinedLobbyContext();
        const isStoredSessionMatch =
          storedContext?.sessionId === session.id && storedContext.accessCode === session.accessCode;
        const resumeTeam = isStoredSessionMatch
          ? session.teams.find((team) => team.id === storedContext.teamId) ?? null
          : null;

        if (isStoredSessionMatch && !resumeTeam) {
          clearStoredTeamContext();
        }

        setResumeTeamId(resumeTeam?.id ?? null);

        setSelectedTeam((currentTeam) => {
          if (resumeTeam) {
            return resumeTeam.color;
          }

          if (!currentTeam) {
            return currentTeam;
          }

          return session.teams.some((team) => team.color === currentTeam) ? "" : currentTeam;
        });

        if (!resumeTeam && session.status !== "LOBBY") {
          setJoinError("La partida ya ha comenzado y el lobby esta cerrado para nuevos equipos.");
        } else if (resumeTeam && session.status !== "LOBBY" && session.status !== "EN_CURSO") {
          setJoinError("La sesion ya no permite reanudar este terminal.");
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSessionSnapshot(null);
        setSelectedTeam("");
        setResumeTeamId(null);
        setJoinError(getSessionErrorMessage(error, "No se ha encontrado una sesion valida con ese codigo."));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const occupiedColors = useMemo(
    () => new Set(sessionSnapshot?.teams.map((team) => team.color) ?? []),
    [sessionSnapshot]
  );
  const resumeTeam = useMemo(
    () => (resumeTeamId ? sessionSnapshot?.teams.find((team) => team.id === resumeTeamId) ?? null : null),
    [resumeTeamId, sessionSnapshot]
  );
  const selectedTeamMeta = useMemo(
    () => TEAM_METADATA.find((team) => team.color === selectedTeam) ?? null,
    [selectedTeam]
  );
  const availableCount = TEAM_METADATA.length - occupiedColors.size;
  const codeStatusMessage = useMemo(() => {
    if (code.length === 0) {
      return {
        tone: "text-slate-500",
        message: "Introduce las 6 posiciones del codigo para validar el acceso.",
      };
    }

    if (code.length < 6) {
      return {
        tone: "text-slate-500",
        message: `Faltan ${6 - code.length} caracteres para validar la sesion.`,
      };
    }

    if (isLoadingSession) {
      return {
        tone: "text-cyan-300",
        message: "Validando sesion...",
      };
    }

    if (resumeTeam && sessionSnapshot?.status === "LOBBY") {
      return {
        tone: "text-cyan-200",
        message: `Sesion valida: puedes reanudar ${resumeTeam.name}.`,
      };
    }

    if (resumeTeam && sessionSnapshot?.status === "EN_CURSO") {
      return {
        tone: "text-cyan-200",
        message: `Partida en curso: puedes reanudar ${resumeTeam.name}.`,
      };
    }

    if (sessionSnapshot?.status === "LOBBY") {
      return {
        tone: "text-emerald-300",
        message: `Sesion valida: ${sessionSnapshot.skin.gameTitle}.`,
      };
    }

    if (sessionSnapshot) {
      return {
        tone: "text-amber-200",
        message: "Codigo reconocido, pero el lobby ya no admite nuevos equipos.",
      };
    }

    return {
      tone: "text-slate-500",
      message: "Esperando validacion del codigo.",
    };
  }, [code, isLoadingSession, resumeTeam, sessionSnapshot]);

  const canResume =
    !!resumeTeam &&
    !!sessionSnapshot &&
    (sessionSnapshot.status === "LOBBY" || sessionSnapshot.status === "EN_CURSO") &&
    !isLoadingSession &&
    !isJoining;

  const canJoin =
    code.length === 6 &&
    !!selectedTeam &&
    !resumeTeam &&
    !!sessionSnapshot &&
    sessionSnapshot.status === "LOBBY" &&
    !occupiedColors.has(selectedTeam) &&
    !isLoadingSession &&
    !isJoining;

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (canResume && resumeTeam && sessionSnapshot) {
      setIsJoining(true);
      setJoinError(null);
      storeJoinedLobbySession({ session: sessionSnapshot, team: resumeTeam });
      navigate("/terminal", { replace: true });
      return;
    }

    if (!canJoin || !selectedTeam) {
      return;
    }

    try {
      setIsJoining(true);
      setJoinError(null);

      const joinedSession = await joinGameSession(code, selectedTeam);
      storeJoinedLobbySession(joinedSession);
      navigate("/terminal", { replace: true });
    } catch (error) {
      setJoinError(getSessionErrorMessage(error, "No se ha podido unir el equipo a la sesión."));
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#020617] text-cyan-400 font-mono relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCAyMGgyMHYtMUgwem0xOSAwSDIwaC0xdjIwSDB6IiBmaWxsPSJyZ2JhKDMsIDEwNSwgMTYxLCAwLjA1KSIvPgo8L3N2Zz4=')] z-0 opacity-40"></div>

      <div className="flex-1 relative z-10 flex flex-col items-center justify-center p-6">
        <Link to="/" className="absolute top-6 left-6 text-slate-500 hover:text-cyan-400 transition-colors p-2 rounded-md hover:bg-slate-800">
          <ArrowLeft className="w-6 h-6" />
        </Link>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm bg-slate-900/80 backdrop-blur-md border border-cyan-800/50 rounded-2xl p-8 shadow-[0_0_40px_-10px_rgba(6,182,212,0.3)]"
        >
          <div className="flex flex-col items-center text-center mb-8">
            <div className="p-3 bg-cyan-950/50 border border-cyan-800 rounded-full mb-4">
              <MonitorSmartphone className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-xl font-black tracking-widest text-white uppercase">Unirse a la partida</h1>
            <p className="text-xs text-slate-400 mt-2">Conectar Terminal de Equipo al lobby</p>
          </div>

          <form onSubmit={handleJoin} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase text-cyan-500 flex items-center gap-2 font-bold tracking-widest">
                <KeyRound className="w-3 h-3" /> Código de Sesión
              </label>
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="EJ: XR892A"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-lg p-4 text-center text-xl font-bold tracking-widest text-white outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder:text-slate-700"
                maxLength={6}
                required
              />
              <div className={`mt-1 flex items-center gap-2 text-[11px] ${codeStatusMessage.tone}`}>
                {isLoadingSession ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                {codeStatusMessage.message}
              </div>
            </div>

            {sessionSnapshot ? (
              <div className="rounded-lg border border-cyan-900/40 bg-slate-950/70 p-4 text-xs leading-5 text-slate-300">
                <div className="flex items-center justify-between gap-4">
                  <span className="uppercase tracking-widest text-slate-500">Partida</span>
                  <span className="text-right font-semibold text-white">{sessionSnapshot.skin.gameTitle}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="uppercase tracking-widest text-slate-500">Lobby</span>
                  <span className={sessionSnapshot.status === "LOBBY" ? "font-semibold text-emerald-300" : "font-semibold text-amber-200"}>
                    {sessionSnapshot.status === "LOBBY" ? "Abierto" : "Cerrado"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="uppercase tracking-widest text-slate-500">Colores libres</span>
                  <span className="font-semibold text-cyan-200">{availableCount} / {TEAM_METADATA.length}</span>
                </div>
                {resumeTeam ? (
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <span className="uppercase tracking-widest text-slate-500">Equipo detectado</span>
                    <span className="font-semibold text-cyan-100">{resumeTeam.name}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">
                Seleccion de color
              </label>
              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-900/60 bg-emerald-950/20 px-3 py-1 text-emerald-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                  Libre
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-500"></span>
                  Ocupado
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-900/60 bg-cyan-950/20 px-3 py-1 text-cyan-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-300"></span>
                  Tu equipo
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {TEAM_METADATA.map((team) => {
                  const isResumeTeam = resumeTeam?.color === team.color;
                  const isAvailable = !resumeTeam && !!sessionSnapshot && sessionSnapshot.status === "LOBBY" && !occupiedColors.has(team.color);
                  const isSelected = selectedTeam === team.color;
                  const availabilityLabel = !sessionSnapshot
                    ? "Pendiente"
                    : isResumeTeam
                    ? "Tu equipo"
                    : sessionSnapshot.status !== "LOBBY"
                    ? "Cerrado"
                    : occupiedColors.has(team.color)
                    ? "Ocupado"
                    : "Libre";
                  const availabilityTone = isResumeTeam
                    ? "text-cyan-200"
                    : !isAvailable
                    ? "text-slate-500"
                    : "text-emerald-200";

                  return (
                    <button
                      key={team.color}
                      type="button"
                      onClick={() => isAvailable && setSelectedTeam(team.color)}
                      disabled={(!isAvailable && !isResumeTeam) || isLoadingSession || isJoining}
                      className={`flex flex-col items-start gap-2 p-3 rounded-lg border text-left transition-all ${
                        isResumeTeam
                          ? 'bg-cyan-950/25 border-cyan-400/70 text-cyan-50 shadow-[0_0_16px_-6px_rgba(34,211,238,0.65)]'
                          : !isAvailable
                          ? 'bg-slate-950/70 border-slate-800 text-slate-500 cursor-not-allowed'
                          : isSelected
                          ? `bg-slate-800 border-current ${team.textClass} shadow-[0_0_15px_-3px_currentColor]`
                          : 'bg-emerald-950/10 border-emerald-700/40 text-slate-100 hover:border-cyan-400 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-4 w-4 rounded-full border ${team.color === "BLANCO" ? 'border-slate-500' : 'border-slate-950/80'} ${team.swatchClass} ${
                            isSelected || isResumeTeam ? 'shadow-[0_0_10px_currentColor]' : ''
                          }`}
                        ></div>
                        <span className="text-xs font-bold uppercase tracking-wider">{team.shortLabel}</span>
                      </div>
                      <span className={`text-[9px] uppercase tracking-widest ${availabilityTone}`}>{availabilityLabel}</span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-[11px] leading-5 text-slate-400">
                {resumeTeam
                  ? `Este navegador ya esta vinculado a ${resumeTeam.name}. Al entrar se recuperara el mismo terminal con su color original.`
                  : selectedTeamMeta
                  ? `Tu equipo se registrara en el servidor como ${selectedTeamMeta.label}.`
                  : "El color que elijas determinara como aparecera tu equipo durante la partida."}
              </div>
              {sessionSnapshot ? (
                <p className="text-[11px] text-slate-500 leading-5">
                  {resumeTeam
                    ? "Tu color queda reservado para este dispositivo mientras el equipo siga existiendo en la sesion."
                    : sessionSnapshot.status === "LOBBY"
                    ? `${sessionSnapshot.teams.length} equipos ya unidos al lobby.`
                    : "La partida ya esta en curso y solo permite reanudar equipos ya vinculados."}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 leading-5">
                  Introduce un codigo valido para consultar la disponibilidad real de colores.
                </p>
              )}
            </div>

            {joinError ? (
              <div className="rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                {joinError}
              </div>
            ) : null}

            <div className="mt-4 pt-6 border-t border-slate-800">
              <button
                type="submit"
                disabled={!canJoin && !canResume}
                className="w-full bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none hover:bg-cyan-500 text-slate-950 font-bold uppercase tracking-widest py-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
              >
                {isJoining ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
                {isJoining ? "Conectando..." : canResume ? "Reanudar terminal" : "Unirse al lobby"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-slate-600 flex items-center justify-center gap-2">
        <ShieldAlert className="w-3 h-3" /> SISTEMA DE COMUNICACIÓN ENCRIPTADO
      </div>
    </div>
  );
}
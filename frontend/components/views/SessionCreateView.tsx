import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, MonitorPlay, Zap, FileText } from "lucide-react";
import { clearAdminSession } from "../../src/lib/auth";
import { storeHostLobbySession } from "../../src/lib/lobbyStorage";
import { type GameConfig, validateSkinComposition } from "../../src/lib/skinApi";
import { createGameSession, getSessionErrorMessage } from "../../src/lib/sessionApi";

export function SessionCreateView() {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<GameConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.removeItem("sessionCode");
    const savedConfigs = localStorage.getItem("gameConfigs");
    if (savedConfigs) {
      const parsed: GameConfig[] = JSON.parse(savedConfigs);
      setConfigs(parsed);
      if (parsed.length > 0) {
        setSelectedConfigId(parsed[0].id);
      }
    }
  }, []);

  useEffect(() => {
    setSessionError(null);
  }, [selectedConfigId]);

  const selectedConfig = configs.find((config) => config.id === selectedConfigId) ?? null;
  const selectedConfigValidation = validateSkinComposition({
    hasMotifs: selectedConfig?.hasMotifs,
    subjects: selectedConfig?.subjects,
    objects: selectedConfig?.objects,
    spaces: selectedConfig?.spaces,
  });

  const handleEnableGame = async () => {
    if (!selectedConfig || !selectedConfigValidation.isValid) {
      return;
    }

    try {
      setIsCreatingSession(true);
      setSessionError(null);

      const session = await createGameSession(selectedConfigId);
      storeHostLobbySession(session);
      navigate("/lobby");
    } catch (error) {
      setSessionError(getSessionErrorMessage(error, "No se pudo habilitar la partida."));
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleLogout = () => {
    clearAdminSession();
    navigate('/');
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.18),_transparent_28%),linear-gradient(180deg,#020617_0%,#020617_38%,#000000_100%)] px-6 py-10 text-slate-100 sm:px-8">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCAyMGgyMHYtMUgwem0xOSAwSDIwaC0xdjIwSDB6IiBmaWxsPSJyZ2JhKDMsIDEwNSwgMTYxLCAwLjA1KSIvPgo8L3N2Zz4=')] opacity-50 z-0"></div>
      <div className="absolute -left-16 top-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl"></div>
      <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"></div>

      <Link to="/" className="absolute top-8 left-8 z-10 text-slate-500 hover:text-cyan-400 transition-colors p-2 rounded-md hover:bg-slate-800 flex items-center gap-2 text-sm font-bold tracking-widest uppercase">
        <ArrowLeft className="w-5 h-5" /> Volver
      </Link>
      <button onClick={handleLogout} className="absolute top-8 right-8 z-10 text-red-300 hover:text-red-200 border border-red-900/60 hover:border-red-500 transition-colors px-4 py-2 rounded-md bg-slate-950/60 text-xs font-bold tracking-widest uppercase">
        Cerrar sesión
      </button>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-2xl"
      >
        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-left shadow-[0_0_45px_-12px_rgba(6,182,212,0.2)] backdrop-blur-sm sm:p-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent"></div>

          <div className="flex flex-col items-center gap-5 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-800/60 bg-slate-950/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-300 shadow-[0_0_30px_rgba(6,182,212,0.12)] backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]"></span>
              Control de partida
            </div>

            <div className="rounded-full border border-cyan-800 bg-cyan-950/30 p-4 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
              <Zap className="h-14 w-14 text-cyan-400" />
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 uppercase sm:text-5xl">
                Habilitar Partida
              </h1>
              <p className="mx-auto max-w-xl text-sm leading-7 text-slate-300 md:text-base">
                Selecciona la configuración del juego y abre la sala de espera. El código de sesión se mostrará en el lobby, justo después de habilitar la partida.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-950/75 p-6 shadow-inner shadow-black/30">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                <FileText className="h-4 w-4" /> Seleccionar CluedoSkin para la partida
              </label>

              {configs.length > 0 ? (
                <select
                  value={selectedConfigId}
                  onChange={(event) => setSelectedConfigId(event.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-cyan-900/40 bg-slate-900 p-3 text-sm text-cyan-100 outline-none transition-colors focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500"
                >
                  {configs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name} ({config.duration} min)
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-400">
                  No hay configuraciones guardadas.
                  <Link to="/config" className="ml-2 font-semibold text-cyan-400 hover:underline">
                    Ir a Administración
                  </Link>
                </div>
              )}
            </div>

            {selectedConfig ? (
              <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-300 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Configuración</p>
                  <p className="mt-2 font-semibold text-slate-100">{selectedConfig.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Título público</p>
                  <p className="mt-2 font-semibold text-slate-100">{selectedConfig.gameTitle}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Duración</p>
                  <p className="mt-2 font-semibold text-slate-100">{selectedConfig.duration} min</p>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 px-4 py-4 text-sm leading-6 text-emerald-100">
              Al habilitar la partida entrarás directamente en la sala de espera para ver los equipos conectados y arrancar el tablero cuando quieras.
            </div>

            {selectedConfig && !selectedConfigValidation.isValid ? (
              <div className="rounded-xl border border-amber-900/70 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
                {selectedConfigValidation.errors[0] ?? "La skin seleccionada no se puede iniciar todavía."}
              </div>
            ) : null}

            {sessionError ? (
              <div className="rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                {sessionError}
              </div>
            ) : null}

            <button
              onClick={handleEnableGame}
              disabled={!selectedConfig || !selectedConfigValidation.isValid || isCreatingSession}
              className="w-full rounded-xl bg-emerald-600 py-5 text-lg font-black uppercase tracking-widest text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all active:scale-95 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800/60 disabled:text-slate-300"
            >
              <span className="flex items-center justify-center gap-3">
                <MonitorPlay className="h-6 w-6" />
                {isCreatingSession ? "Habilitando partida..." : "Habilitar Partida"}
              </span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
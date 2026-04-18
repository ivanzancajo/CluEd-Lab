import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, KeyRound, MonitorPlay, Zap, Copy, CheckCircle2, FileText } from "lucide-react";
import { clearAdminSession } from "../../src/lib/auth";
import { type GameConfig, validateSkinComposition } from "../../src/lib/skinApi";
import { createGameSession, getSessionErrorMessage } from "../../src/lib/sessionApi";

export function SessionCreateView() {
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState("");
  const [copied, setCopied] = useState(false);
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
    setSessionCode("");
    setSessionError(null);
  }, [selectedConfigId]);

  const selectedConfig = configs.find((config) => config.id === selectedConfigId) ?? null;
  const selectedConfigValidation = validateSkinComposition({
    hasMotifs: selectedConfig?.hasMotifs,
    subjects: selectedConfig?.subjects,
    objects: selectedConfig?.objects,
    spaces: selectedConfig?.spaces,
  });

  const handleCopy = async () => {
    if (!sessionCode) {
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(sessionCode);
        setCopied(true);
      } else {
        throw new Error("Clipboard API not available");
      }
    } catch {
      // Fallback para navegadores antiguos
      const textArea = document.createElement("textarea");
      textArea.value = sessionCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
      setCopied(true);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartBoard = async () => {
    if (!selectedConfig || !selectedConfigValidation.isValid) {
      return;
    }

    try {
      setIsCreatingSession(true);
      setSessionError(null);

      const session = await createGameSession(selectedConfigId);
      setSessionCode(session.accessCode);
      localStorage.setItem("sessionCode", session.accessCode);
      localStorage.setItem("duration", session.skin.duration);
      localStorage.setItem("gameTitle", session.skin.gameTitle);
      localStorage.setItem("centerImage", session.skin.centerImage);
      localStorage.setItem("activeConfig", JSON.stringify(session.skin));
      navigate("/board");
    } catch (error) {
      setSessionError(getSessionErrorMessage(error, "No se pudo iniciar la sesión."));
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleLogout = () => {
    clearAdminSession();
    navigate('/');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-black text-cyan-400 font-mono">
      <Link to="/" className="absolute top-8 left-8 text-slate-500 hover:text-cyan-400 transition-colors p-2 rounded-md hover:bg-slate-800 flex items-center gap-2 text-sm font-bold tracking-widest uppercase">
        <ArrowLeft className="w-5 h-5" /> Volver
      </Link>
      <button onClick={handleLogout} className="absolute top-8 right-8 text-red-300 hover:text-red-200 border border-red-900/60 hover:border-red-500 transition-colors px-4 py-2 rounded-md bg-slate-950/60 text-xs font-bold tracking-widest uppercase">
        Cerrar sesión
      </button>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl p-8 bg-slate-900/50 border border-cyan-800/50 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.1)] flex flex-col items-center text-center gap-8 backdrop-blur-sm"
      >
        <div className="p-4 bg-emerald-950/30 border border-emerald-800 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.15)]">
          <Zap className="w-12 h-12 text-emerald-400" />
        </div>
        
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 uppercase">
            Sesión de Juego Lista
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Selecciona la configuración a utilizar. El código de acceso se generará al iniciar la sesión.
          </p>
        </div>

        <div className="w-full text-left flex flex-col gap-2 p-6 bg-slate-950/50 border border-slate-800 rounded-xl">
          <label className="text-[10px] uppercase text-indigo-400 flex items-center gap-2 font-bold tracking-widest">
            <FileText className="w-4 h-4"/> Seleccionar cluedoskin para el juego
          </label>
          {configs.length > 0 ? (
            <select 
              value={selectedConfigId}
              onChange={(e) => setSelectedConfigId(e.target.value)}
              className="w-full bg-slate-900 border border-indigo-900/50 focus:border-indigo-400 rounded-lg p-3 text-sm text-indigo-100 appearance-none outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
            >
              {configs.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.duration} min)</option>
              ))}
            </select>
          ) : (
            <div className="p-3 bg-slate-900/80 rounded border border-slate-800 text-slate-500 text-sm italic">
              No hay configuraciones guardadas.
              <Link to="/config" className="text-indigo-400 hover:underline ml-2">Ir a Administración</Link>
            </div>
          )}

          {selectedConfig && !selectedConfigValidation.isValid ? (
            <div className="p-3 bg-amber-950/30 border border-amber-900/70 rounded text-amber-100 text-sm">
              {selectedConfigValidation.errors[0] ?? "La skin seleccionada no se puede iniciar todavía."}
            </div>
          ) : null}
        </div>

        <div className="w-full p-6 bg-slate-950 border border-slate-700 rounded-xl flex flex-col gap-4">
          <label className="text-[10px] uppercase text-cyan-500 flex items-center justify-center gap-2 font-bold tracking-widest">
            <KeyRound className="w-4 h-4"/> Código de Acceso
          </label>
          
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-black border border-cyan-900/50 rounded-lg p-6 flex items-center justify-center relative group">
              <span className="text-5xl font-black tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                {sessionCode || "------"}
              </span>
            </div>
            <button 
              onClick={handleCopy}
              disabled={!sessionCode}
              className="h-full px-6 flex flex-col items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-300 rounded-lg border border-slate-700 transition-colors"
              title="Copiar código"
            >
              {copied ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <Copy className="w-6 h-6" />}
              <span className="text-[10px] uppercase tracking-wider">{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>

          <p className="text-center text-xs text-slate-500">
            {sessionCode
              ? "Código generado y listo para compartir."
              : "El código aparecerá cuando pulses iniciar pantalla central."}
          </p>
        </div>

        {sessionError ? (
          <div className="w-full rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-100">
            {sessionError}
          </div>
        ) : null}

        <button 
          onClick={handleStartBoard} 
          disabled={!selectedConfig || !selectedConfigValidation.isValid || isCreatingSession}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black uppercase tracking-widest py-5 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.3)] text-lg"
        >
          <MonitorPlay className="w-6 h-6" /> {isCreatingSession ? "Iniciando sesión..." : "Iniciar Pantalla Central"}
        </button>

      </motion.div>
    </div>
  );
}
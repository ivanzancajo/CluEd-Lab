import React, { useState, useEffect, useCallback } from "react"; // Añadimos useCallback por seguridad
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, KeyRound, MonitorPlay, Zap, Copy, CheckCircle2, FileText } from "lucide-react";
import { clearAdminSession } from "../../src/lib/auth";

// 1. Definimos la Interface para eliminar la advertencia 'any' de la línea 11
interface GameConfig {
  id: string;
  name: string;
  gameTitle: string;
  duration: string;
  centerImage: string;
}

export function SessionCreateView() {
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState("");
  const [copied, setCopied] = useState(false);
  
  // CORRECCIÓN: Tipamos el estado de las configuraciones
  const [configs, setConfigs] = useState<GameConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");

  // 2. Usamos useCallback para que ESLint reconozca la función como estable
  const generateCode = useCallback(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSessionCode(result);
    localStorage.setItem("sessionCode", result);
  }, []);

  useEffect(() => {
    generateCode();
    const savedConfigs = localStorage.getItem("gameConfigs");
    if (savedConfigs) {
      const parsed: GameConfig[] = JSON.parse(savedConfigs);
      setConfigs(parsed);
      if (parsed.length > 0) {
        setSelectedConfigId(parsed[0].id);
      }
    }
  }, [generateCode]);

  const handleCopy = async () => {
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

  const handleStartBoard = () => {
    if (selectedConfigId) {
      const activeConfig = configs.find(c => c.id === selectedConfigId);
      if (activeConfig) {
        localStorage.setItem("duration", activeConfig.duration);
        localStorage.setItem("gameTitle", activeConfig.gameTitle);
        localStorage.setItem("centerImage", activeConfig.centerImage);
        localStorage.setItem("activeConfig", JSON.stringify(activeConfig));
      }
    }
    navigate("/board");
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
            Selecciona la configuración a utilizar y comparte el código de acceso con los equipos.
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
        </div>

        <div className="w-full p-6 bg-slate-950 border border-slate-700 rounded-xl flex flex-col gap-4">
          <label className="text-[10px] uppercase text-cyan-500 flex items-center justify-center gap-2 font-bold tracking-widest">
            <KeyRound className="w-4 h-4"/> Código de Acceso
          </label>
          
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-black border border-cyan-900/50 rounded-lg p-6 flex items-center justify-center relative group">
              <span className="text-5xl font-black tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                {sessionCode}
              </span>
            </div>
            <button 
              onClick={handleCopy}
              className="h-full px-6 flex flex-col items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
              title="Copiar código"
            >
              {copied ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <Copy className="w-6 h-6" />}
              <span className="text-[10px] uppercase tracking-wider">{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
          
          <button onClick={generateCode} className="text-xs text-slate-500 hover:text-cyan-400 underline decoration-dashed underline-offset-4 transition-colors">
            Regenerar código
          </button>
        </div>

        <button 
          onClick={handleStartBoard} 
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black uppercase tracking-widest py-5 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.3)] text-lg"
        >
          <MonitorPlay className="w-6 h-6" /> Iniciar Pantalla Central
        </button>

      </motion.div>
    </div>
  );
}
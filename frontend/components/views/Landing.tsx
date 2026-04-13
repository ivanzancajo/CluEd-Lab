import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Monitor, Terminal as TerminalIcon, Cpu, Fingerprint, Settings, Zap } from "lucide-react";
import { motion } from "motion/react";

export function Landing() {
  const [gameTitle, setGameTitle] = useState("Cluedo Online");

  useEffect(() => {
    const savedTitle = localStorage.getItem("gameTitle");
    if (savedTitle) {
      setGameTitle(savedTitle);
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-12 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-black">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCAyMGgyMHYtMUgwem0xOSAwSDIwaC0xdjIwSDB6IiBmaWxsPSJyZ2JhKDMsIDEwNSwgMTYxLCAwLjA1KSIvPgo8L3N2Zz4=')] opacity-50 z-0"></div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex flex-col items-center gap-4 text-center max-w-2xl"
      >
        <div className="p-4 bg-cyan-950/30 border border-cyan-800 rounded-full mb-4 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
          <Fingerprint className="w-16 h-16 text-cyan-400" />
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 drop-shadow-[0_0_15px_rgba(45,212,191,0.5)] uppercase break-words px-4">
          {gameTitle}
        </h1>
      </motion.div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl">
        <Link to="/config" className="group flex flex-col items-center justify-center p-10 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-purple-500 rounded-2xl transition-all duration-300 hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.3)] hover:-translate-y-2">
          <Settings className="w-16 h-16 mb-6 text-slate-500 group-hover:text-purple-400 transition-colors" />
          <h2 className="text-xl font-bold text-slate-300 group-hover:text-white text-center">Configurar CluedoSkin</h2>
        </Link>

        <Link to="/host" className="group flex flex-col items-center justify-center p-10 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-yellow-500 rounded-2xl transition-all duration-300 hover:shadow-[0_0_40px_-10px_rgba(234,179,8,0.3)] hover:-translate-y-2">
          <Zap className="w-16 h-16 mb-6 text-slate-500 group-hover:text-yellow-400 transition-colors" />
          <h2 className="text-xl font-bold text-slate-300 group-hover:text-white text-center">Crear Sesión</h2>
        </Link>

        <Link to="/board" className="group flex flex-col items-center justify-center p-10 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500 rounded-2xl transition-all duration-300 hover:shadow-[0_0_40px_-10px_rgba(6,182,212,0.3)] hover:-translate-y-2">
          <Monitor className="w-16 h-16 mb-6 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          <h2 className="text-xl font-bold text-slate-300 group-hover:text-white text-center">Pantalla Central</h2>
        </Link>
        
        <Link to="/join" className="group flex flex-col items-center justify-center p-10 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500 rounded-2xl transition-all duration-300 hover:shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)] hover:-translate-y-2">
          <TerminalIcon className="w-16 h-16 mb-6 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          <h2 className="text-xl font-bold text-slate-300 group-hover:text-white text-center">Unirse a Sesión</h2>
        </Link>
      </div>

      <div className="fixed bottom-4 left-0 right-0 text-center text-xs text-slate-600 flex items-center justify-center gap-2">
        <Cpu className="w-4 h-4" /> V2.4.1 SECURE KERNEL ACTIVATED
      </div>
    </div>
  );
}

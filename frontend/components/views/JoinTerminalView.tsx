import React, { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, KeyRound, MonitorSmartphone, ShieldAlert, Cpu } from "lucide-react";

const TEAMS = [
  { id: "rojo", name: "Equipo Rojo", color: "bg-red-500", text: "text-red-400", available: false },
  { id: "amarillo", name: "Equipo Amarillo", color: "bg-yellow-500", text: "text-yellow-400", available: true },
  { id: "azul", name: "Equipo Azul", color: "bg-blue-500", text: "text-blue-400", available: true },
  { id: "verde", name: "Equipo Verde", color: "bg-green-500", text: "text-green-400", available: false },
  { id: "morado", name: "Equipo Morado", color: "bg-purple-500", text: "text-purple-400", available: true },
  { id: "blanco", name: "Equipo Blanco", color: "bg-slate-200", text: "text-slate-300", available: false },
];

export function JoinTerminalView() {
  const [code, setCode] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const navigate = useNavigate();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6 && selectedTeam) {
      // Logic for joining session would go here, proceeding to terminal view for now
      navigate("/terminal");
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#020617] text-cyan-400 font-mono relative overflow-hidden">
      {/* Background pattern */}
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
            <p className="text-xs text-slate-400 mt-2">Conectar Terminal de Equipo</p>
          </div>

          <form onSubmit={handleJoin} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase text-cyan-500 flex items-center gap-2 font-bold tracking-widest">
                <KeyRound className="w-3 h-3" /> Código de Sesión
              </label>
              <input 
                type="text" 
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="EJ: XR892A" 
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-lg p-4 text-center text-xl font-bold tracking-widest text-white outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder:text-slate-700"
                maxLength={6}
                required
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">
                Selección de Equipo
              </label>
              <div className="grid grid-cols-2 gap-3">
                {TEAMS.map(team => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => team.available && setSelectedTeam(team.id)}
                    disabled={!team.available}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                      !team.available 
                        ? 'bg-slate-900/30 border-slate-900 text-slate-800 cursor-not-allowed opacity-50'
                        : selectedTeam === team.id 
                        ? `bg-slate-800 border-current ${team.text} shadow-[0_0_15px_-3px_currentColor]` 
                        : 'bg-slate-950/50 border-slate-800 text-slate-600 hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${team.color} ${selectedTeam === team.id ? 'animate-pulse shadow-[0_0_8px_currentColor]' : 'opacity-50'}`}></div>
                    <span className="text-xs font-bold uppercase tracking-wider">{team.id}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-6 border-t border-slate-800">
              <button 
                type="submit"
                disabled={code.length !== 6 || !selectedTeam}
                className="w-full bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none hover:bg-cyan-500 text-slate-950 font-bold uppercase tracking-widest py-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
              >
                 <Cpu className="w-5 h-5" /> Jugar
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
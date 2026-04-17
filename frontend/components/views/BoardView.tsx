import { useState, useEffect } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Clock, Activity, AlertTriangle, ArrowLeft, History, Users, RefreshCw, MonitorPlay, GitCommit, KeyRound } from "lucide-react";

const boardImg = "/board-placeholder.svg";

const MOCK_EVENTS = [
  { id: 1, time: "14:52:10", type: "system", msg: "INICIALIZACIÓN DE RED O.P.T.I.C.A COMPLETADA." },
  { id: 2, time: "14:53:05", type: "action", team: "Rojo", msg: "Equipo Rojo ha avanzado a Sala Hedy Lamarr" },
  { id: 3, time: "14:54:30", type: "suggest", team: "Verde", msg: "Equipo Verde sugiere: 'Alan Turing' con 'Diodo Láser' en 'Cámara Anecoica'" },
  { id: 4, time: "14:55:00", type: "error", msg: "Anomalía térmica detectada en Seminario Maxwell." },
  { id: 5, time: "14:56:12", type: "action", team: "Azul", msg: "Equipo Azul lanza dados: 8. Avanza hacia Club de Radio." },
];

const TEAMS = [
  { id: "rojo", name: "Rojo", color: "#ef4444", status: "activo", location: "Sala Hedy Lamarr" },
  { id: "amarillo", name: "Amar", color: "#eab308", status: "espera", location: "Central de Conmutación" },
  { id: "azul", name: "Azul", color: "#3b82f6", status: "espera", location: "Club de radio" },
  { id: "verde", name: "Verde", color: "#22c55e", status: "espera", location: "Lab. Electrónica" },
  { id: "morado", name: "Mora", color: "#a855f7", status: "espera", location: "Cámara Anecoica" },
  { id: "blanco", name: "Blan", color: "#f8fafc", status: "espera", location: "Seminario Maxwell" },
];

// Rough coordinates mapped over the image (0-100%)
const PAWN_POSITIONS = {
  rojo: { top: "25%", left: "48%" },
  amarillo: { top: "33%", left: "87%" },
  azul: { top: "69%", left: "12%" },
  verde: { top: "90%", left: "41%" },
  morado: { top: "26%", left: "12%" },
  blanco: { top: "89%", left: "58%" },
};

export function BoardView() {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [sessionCode, setSessionCode] = useState("");
  const [centerImage, setCenterImage] = useState("");
  
  useEffect(() => {
    // Get session config
    const savedCode = localStorage.getItem("sessionCode") || "N/A";
    const savedDuration = parseInt(localStorage.getItem("duration") || "60", 10);
    const savedCenterImg = localStorage.getItem("centerImage") || "";
    
    setSessionCode(savedCode);
    setCenterImage(savedCenterImg);
    setTimeRemaining(savedDuration * 60);

    const timer = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex w-full h-screen bg-[#020617] text-cyan-400 font-mono overflow-hidden">
      {/* Sidebar - Control & Status */}
      <div className="w-[380px] h-full bg-slate-900/40 border-r border-cyan-800/50 shadow-[4px_0_24px_-4px_rgba(6,182,212,0.15)] flex flex-col relative z-20 backdrop-blur-md">
        
        {/* Header Logo/Back */}
        <div className="flex items-center gap-3 p-5 border-b border-cyan-800/50 bg-slate-900/60">
          <Link to="/" className="text-slate-500 hover:text-cyan-400 transition-colors p-2 rounded-md hover:bg-slate-800">
             <ArrowLeft className="w-5 h-5" />
          </Link>
          <MonitorPlay className="w-6 h-6 text-emerald-400" />
          <div className="flex-1">
            <h1 className="text-sm font-bold tracking-widest text-emerald-400">PANTALLA CENTRAL</h1>
            <p className="text-[10px] text-slate-500">PROYECTOR MAIN-01</p>
          </div>
        </div>

        {/* Global Status HUD */}
        <div className="p-6 border-b border-cyan-800/30 grid grid-cols-2 gap-4 bg-gradient-to-b from-cyan-950/10 to-transparent">
          <div className="flex flex-col gap-1 p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-inner shadow-slate-950/50">
             <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase"><KeyRound className="w-3 h-3"/> Código Sesión</span>
             <span className="text-xl font-mono font-bold tracking-widest text-emerald-400">{sessionCode}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 bg-slate-900 border border-slate-800 rounded-lg shadow-inner shadow-slate-950/50 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500"></div>
             <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase"><Clock className="w-3 h-3"/> Tiempo Restante</span>
             <span className={`text-xl font-bold font-mono tracking-widest ${timeRemaining < 300 ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`}>
                {formatTime(timeRemaining)}
             </span>
          </div>
        </div>

        {/* Teams Status List */}
        <div className="px-6 py-4 border-b border-cyan-800/30">
          <h3 className="text-xs uppercase text-cyan-600 mb-4 flex items-center gap-2 font-bold tracking-widest">
            <Users className="w-4 h-4" /> Nodos de Equipos
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {TEAMS.map(team => (
              <div key={team.id} className={`flex items-center gap-2 p-2 rounded border ${team.status === 'activo' ? 'border-cyan-500 bg-cyan-950/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'border-slate-800 bg-slate-900/50 opacity-70'} transition-all`}>
                <div className="w-3 h-3 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.2)]" style={{ backgroundColor: team.color }}></div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-200 truncate">{team.name}</span>
                  <span className="text-[9px] text-slate-500 truncate" title={team.location}>{team.location}</span>
                </div>
                {team.status === 'activo' && <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />}
              </div>
            ))}
          </div>
        </div>

        {/* Event Log */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-slate-900 to-[#020617]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs uppercase text-cyan-600 flex items-center gap-2 font-bold tracking-widest">
              <History className="w-4 h-4" /> Registro de Eventos
            </h3>
            <RefreshCw className="w-3 h-3 text-cyan-800" />
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-transparent">
            {MOCK_EVENTS.map(ev => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }}
                key={ev.id} 
                className={`p-3 rounded border text-xs leading-relaxed font-light ${
                  ev.type === 'error' ? 'bg-red-950/20 border-red-900/50 text-red-300' :
                  ev.type === 'suggest' ? 'bg-orange-950/20 border-orange-900/50 text-orange-200' :
                  ev.type === 'system' ? 'bg-slate-900/50 border-slate-800 text-slate-400 font-bold' :
                  'bg-cyan-950/10 border-cyan-900/30 text-cyan-100'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] opacity-60 font-mono flex items-center gap-1">
                     <GitCommit className="w-3 h-3" />
                     {ev.time}
                  </span>
                  {ev.type === 'error' && <AlertTriangle className="w-3 h-3 text-red-500" />}
                </div>
                {ev.msg}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Board Area */}
      <div className="flex-1 relative bg-[#020617] flex items-center justify-center p-8 overflow-hidden">
        {/* Tech Grid Background overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCA0MGg0MHYtMUgwem0zOSAwSDQwaC0xdjQwSDB6IiBmaWxsPSJyZ2JhKDMsIDEwNSwgMTYxLCAwLjA1KSIvPgo8L3N2Zz4=')] z-0"></div>
        
        {/* Map Container */}
        <div className="relative z-10 w-full max-w-5xl aspect-square bg-[#380b0b] rounded-xl shadow-[0_0_60px_-10px_rgba(0,0,0,1)] border-4 border-slate-800 p-2 flex items-center justify-center">
            
            {/* The actual board image container */}
            <div className="relative w-full h-full rounded-lg overflow-hidden border border-[#5c1a1a]">
               <img src={boardImg} alt="Tablero Muerte de una Ingenia" className="w-full h-full object-contain" />
               
               {/* Optional Center Image (Logo) Overlay */}
               {centerImage && (
                 <div className="absolute top-[48%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] pointer-events-none z-10 flex items-center justify-center">
                   <img src={centerImage} alt="Center Logo" className="max-w-full max-h-full object-contain drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]" />
                 </div>
               )}

               {/* Overlay pawns based on positions */}
               {TEAMS.map(team => (
                 <motion.div
                   key={team.id}
                   initial={{ scale: 0 }}
                   animate={{ scale: 1 }}
                   transition={{ type: "spring", stiffness: 200, damping: 10 }}
                   className="absolute w-8 h-8 md:w-10 md:h-10 rounded-full border-[3px] border-slate-900 shadow-[0_0_15px_rgba(0,0,0,0.8)] z-20 flex items-center justify-center"
                   style={{
                     backgroundColor: team.color,
                     top: PAWN_POSITIONS[team.id as keyof typeof PAWN_POSITIONS]?.top || "50%",
                     left: PAWN_POSITIONS[team.id as keyof typeof PAWN_POSITIONS]?.left || "50%",
                     transform: 'translate(-50%, -50%)'
                   }}
                 >
                   {/* Inner glow/tech detail for pawn */}
                   <div className="w-1/2 h-1/2 rounded-full bg-white/30 backdrop-blur-sm"></div>
                 </motion.div>
               ))}
            </div>

            {/* Corner Decorative Elements */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-800 -translate-x-4 -translate-y-4"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-800 translate-x-4 -translate-y-4"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-800 -translate-x-4 translate-y-4"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-800 translate-x-4 translate-y-4"></div>
        </div>

      </div>
    </div>
  );
}

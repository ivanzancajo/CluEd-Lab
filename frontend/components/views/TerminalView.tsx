import React, { useState } from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { 
  Map as MapIcon, 
  Search, 
  FileText, 
  MessageSquare, 
  ArrowLeft,
  X,
  HelpCircle,
  Crosshair,
  User,
  Box,
  MapPin,
  Cpu,
  Activity,
  Zap,
  Wifi,
  Shield,
  Radio,
  Database
} from "lucide-react";
import { DiceAnimation } from "../DiceAnimation";
import { createLobbySocketClient, subscribeTeamToLobby, type LobbyPresenceState } from "../../src/lib/lobbySocket";
import { getStoredSessionId, getStoredTeamColor, getStoredTeamId, getStoredTeamName } from "../../src/lib/lobbyStorage";
import { getTeamMeta } from "../../src/lib/teamMeta";
import type { SessionStatus, TeamColor } from "../../src/lib/sessionApi";

const boardImg = "/board-placeholder.svg";

interface ElementoItem {
  name: string;
  desc: string;
  avatar: React.ReactNode;
  color: string;
  motif?: string;
}

// Interfaz para los datos puros que vienen del "activeConfig"
interface RawItem {
  id: string;
  name: string;
  desc: string;
  motif?: string;
  imageUrl?: string;
}

interface GameConfig {
  id: string;
  cat1Name?: string;
  cat2Name?: string;
  cat3Name?: string;
  hasMotifs?: boolean;
  subjects?: RawItem[];
  objects?: RawItem[];
  spaces?: RawItem[];
}

// Categorías convertidas a objetos dinámicos con avatares predefinidos (íconos tech)
const CATEGORIES = {
  sujetos: [
    { name: "Ada Lovelace", avatar: <User className="w-3 h-3 text-pink-400" />, color: "bg-pink-950/30 border-pink-800" },
    { name: "Alan Turing", avatar: <Cpu className="w-3 h-3 text-blue-400" />, color: "bg-blue-950/30 border-blue-800" },
    { name: "Nikola Tesla", avatar: <Zap className="w-3 h-3 text-yellow-400" />, color: "bg-yellow-950/30 border-yellow-800" },
    { name: "Marie Curie", avatar: <Activity className="w-3 h-3 text-emerald-400" />, color: "bg-emerald-950/30 border-emerald-800" },
    { name: "Hedy Lamarr", avatar: <Wifi className="w-3 h-3 text-cyan-400" />, color: "bg-cyan-950/30 border-cyan-800" },
    { name: "Max Planck", avatar: <Database className="w-3 h-3 text-purple-400" />, color: "bg-purple-950/30 border-purple-800" }
  ],
  objetos: [
    { name: "Osciloscopio", avatar: <Activity className="w-3 h-3 text-emerald-400" />, color: "bg-emerald-950/30 border-emerald-800" },
    { name: "Cable de Fibra", avatar: <Radio className="w-3 h-3 text-orange-400" />, color: "bg-orange-950/30 border-orange-800" },
    { name: "Diodo Láser", avatar: <Crosshair className="w-3 h-3 text-red-400" />, color: "bg-red-950/30 border-red-800" },
    { name: "Soldador", avatar: <Zap className="w-3 h-3 text-amber-400" />, color: "bg-amber-950/30 border-amber-800" },
    { name: "Batería C.", avatar: <Shield className="w-3 h-3 text-lime-400" />, color: "bg-lime-950/30 border-lime-800" },
    { name: "Llave Inglesa", avatar: <Box className="w-3 h-3 text-slate-400" />, color: "bg-slate-800/50 border-slate-600" }
  ],
  espacios: [
    { name: "Cámara Anecoica", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "Sala H. Lamarr", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "C. Conmutación", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "Seminario Haykin", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "Club de radio", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "L. Com. Ópticas", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "L. Electrónica", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "Seminario Maxwell", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" },
    { name: "S. Torres Quevedo", avatar: <MapPin className="w-3 h-3 text-red-500" />, color: "bg-red-950/20 border-red-900" }
  ]
};

const TEAMS = ["Rojo", "Amarillo", "Azul", "Verde", "Morado", "Blanco"];

export function TerminalView() {
  const [activeTab, setActiveTab] = useState("map");
  const [centerImage, setCenterImage] = useState("");
  const [teamName, setTeamName] = useState(getStoredTeamName() || "Equipo sin asignar");
  const [teamColor, setTeamColor] = useState<TeamColor | null>(getStoredTeamColor());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("LOBBY");
  const [lobbyConnectionStatus, setLobbyConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  
  const [categories, setCategories] = useState<{
    c1: ElementoItem[];
    c2: ElementoItem[];
    c3: ElementoItem[];
  }>({
    c1: CATEGORIES.sujetos.map(s => ({ ...s, desc: "Descripción", motif: "" })),
    c2: CATEGORIES.objetos.map(o => ({ ...o, desc: "Descripción", motif: "" })),
    c3: CATEGORIES.espacios.map(e => ({ ...e, desc: "Descripción", motif: "" }))
  });
  const [catNames, setCatNames] = useState({ c1: "Sujetos", c2: "Objetos", c3: "Espacios" });

  // Mock turn state
  const [isMyTurn, setIsMyTurn] = useState(false);

  // Mock cards for inventory
  const MOCK_CARDS = [
    { id: "c1", name: "Alan Turing", desc: "Criptoanalista. Maestro de la deducción lógica.", type: catNames.c1, color: "border-blue-500", bg: "bg-blue-950", image: "https://images.unsplash.com/photo-1623366302587-b38b1ddaefd9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwb3J0cmFpdCUyMG1hbnxlbnwxfHx8fDE3NzUyMjg2NzN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" },
    { id: "c2", name: "Osciloscopio", desc: "Capaz de emitir pulsos letales de alto voltaje.", type: catNames.c2, color: "border-emerald-500", bg: "bg-emerald-950", image: "https://images.unsplash.com/photo-1527167151437-87cf28fb6b38?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx2aW50YWdlJTIwb3NjaWxsb3Njb3BlfGVufDF8fHx8MTc3NTIzNzc2Mnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" },
    { id: "c3", name: "Cámara Anecoica", desc: "Aislamiento total. Nadie escucharía un grito.", type: catNames.c3, color: "border-red-500", bg: "bg-red-950", image: "https://images.unsplash.com/photo-1624279973450-0de3a3802f31?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb3VuZHByb29mJTIwcm9vbXxlbnwxfHx8fDE3NzUyMzc3Njl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" }
  ];
  
  const [selectedCard, setSelectedCard] = useState<typeof MOCK_CARDS[0] | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [suggestMode, setSuggestMode] = useState("hipotesis");
  
  // Mock room for locking hypothesis
  const currentRoomMock = "Cámara Anecoica";
  const [selectedRoom, setSelectedRoom] = useState(currentRoomMock);

  // Fetch active config and map to Terminal's internal state
  React.useEffect(() => {
    if (suggestMode === "hipotesis") {
      setSelectedRoom(currentRoomMock);
    }
  }, [suggestMode, currentRoomMock]);

  // Fetch active config and map to Terminal's internal state
  React.useEffect(() => {
    const savedImg = localStorage.getItem("centerImage");
    if (savedImg) {
      setCenterImage(savedImg);
    }
    
    const activeConf = localStorage.getItem("activeConfig");
    if (activeConf) {
      try {
        // CORRECCIÓN: Usamos la interfaz aquí para tipar el JSON.parse
        const parsed: GameConfig = JSON.parse(activeConf);
        
        setCatNames({
          c1: parsed.cat1Name || "Sujetos",
          c2: parsed.cat2Name || "Objetos",
          c3: parsed.cat3Name || "Espacios"
        });

        const showMotifs = parsed.hasMotifs === true;
        
        // Map configs to the categories format expected by TerminalView
        const mapItems = (items: RawItem[], defaultIcon: React.ReactNode, defaultColor: string): ElementoItem[] => {
          return items.map((item) => ({
            name: item.name,
            desc: item.desc,
            motif: showMotifs ? item.motif : undefined,
            avatar: defaultIcon,
            color: defaultColor
          }));
        };

        setCategories({
          c1: mapItems(parsed.subjects || [], <User className="w-3 h-3 text-cyan-400" />, "bg-cyan-950/30 border-cyan-800"),
          c2: mapItems(parsed.objects || [], <Box className="w-3 h-3 text-emerald-400" />, "bg-emerald-950/30 border-emerald-800"),
          c3: mapItems(parsed.spaces || [], <MapPin className="w-3 h-3 text-red-500" />, "bg-red-950/20 border-red-900")
        });
      } catch(e) {
        console.error("Error parsing config", e);
      }
    }
  }, []);

  React.useEffect(() => {
    const sessionId = getStoredSessionId();
    const teamId = getStoredTeamId();

    if (!sessionId || !teamId) {
      setLobbyConnectionStatus("error");
      setLobbyError("No se ha encontrado un equipo activo para este terminal.");
      return;
    }

    const socket = createLobbySocketClient();

    const applyPresenceState = (state: LobbyPresenceState) => {
      const currentTeam = state.teams.find((team) => team.id === teamId);

      if (!currentTeam) {
        setLobbyConnectionStatus("error");
        setLobbyError("El equipo seleccionado ya no pertenece al lobby actual.");
        return;
      }

      setTeamName(currentTeam.name);
      setTeamColor(currentTeam.color);
      setSessionStatus(state.status);
      setLobbyConnectionStatus(currentTeam.connected ? "connected" : "disconnected");
    };

    socket.on("connect", async () => {
      setLobbyConnectionStatus("connecting");

      const response = await subscribeTeamToLobby(socket, sessionId, teamId);
      if (!response.ok) {
        setLobbyConnectionStatus("error");
        setLobbyError(response.error);
        return;
      }

      setLobbyError(null);
      applyPresenceState(response.state);
    });

    socket.on("lobby:presence-updated", applyPresenceState);
    socket.on("disconnect", () => {
      setLobbyConnectionStatus("disconnected");
    });
    socket.on("connect_error", () => {
      setLobbyConnectionStatus("error");
      setLobbyError("No se ha podido conectar el terminal con la sala de espera.");
    });

    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, []);

  const currentTeamMeta = teamColor ? getTeamMeta(teamColor) : null;
  const sessionStatusLabel = sessionStatus === "EN_CURSO" ? "PARTIDA EN CURSO" : "SALA DE ESPERA";
  const connectionLabel =
    lobbyConnectionStatus === "connected"
      ? "CONECTADO"
      : lobbyConnectionStatus === "connecting"
      ? "CONECTANDO"
      : lobbyConnectionStatus === "disconnected"
      ? "DESCONECTADO"
      : "ERROR DE ENLACE";
  
  // Matrix state: "row-col" -> 0 (neutral), 1 (doubt), 2 (discarded)
  const [matrix, setMatrix] = useState<Record<string, number>>({});
  
  const handleCellClick = (row: string, col: string) => {
    const key = `${row}-${col}`;
    const current = matrix[key] || 0;
    const next = (current + 1) % 3;
    setMatrix(prev => ({ ...prev, [key]: next }));
  };

  const renderCellIcon = (state: number) => {
    if (state === 1) return <HelpCircle className="w-4 h-4 text-orange-500" />;
    if (state === 2) return <X className="w-4 h-4 text-red-500" />;
    return null;
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#020617] text-cyan-400 font-mono relative overflow-hidden shadow-2xl border-x border-slate-900">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-950/80 backdrop-blur-md border-b border-cyan-900/50 sticky top-0 z-50">
        <Link to="/" className="text-slate-500 hover:text-cyan-400 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="text-center flex flex-col items-center">
          <h2 className="text-xs font-bold text-emerald-400 tracking-widest uppercase flex items-center gap-2">
            Terminal
            <button 
              onClick={() => setIsMyTurn(!isMyTurn)} 
              className={`text-[8px] px-2 py-0.5 rounded-full font-bold border transition-colors ${isMyTurn ? 'bg-cyan-900 border-cyan-400 text-cyan-200' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
              title="Alternar Turno (Testing)"
            >
              {isMyTurn ? "MI TURNO" : "ESPERA"}
            </button>
          </h2>
          <p className={`text-[10px] mt-1 ${currentTeamMeta?.textClass ?? 'text-slate-500'}`}>
            {teamName.toUpperCase()} - {sessionStatusLabel} - {connectionLabel}
          </p>
        </div>
        <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse ${isMyTurn ? 'bg-emerald-500 shadow-emerald-500/80' : 'bg-red-500 shadow-red-500/80'}`}></div>
      </div>

      {!lobbyError ? (
        <div className="px-4 py-2 bg-cyan-950/30 border-b border-cyan-900/50 text-[11px] text-cyan-100 uppercase tracking-[0.22em]">
          {sessionStatus === "EN_CURSO" ? "Partida iniciada por el Game Master." : "Esperando a que el Game Master inicie la partida."}
        </div>
      ) : null}

      {lobbyError ? (
        <div className="px-4 py-2 bg-red-950/40 border-b border-red-900/60 text-[11px] text-red-100">
          {lobbyError}
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/50 to-[#020617]">
        <AnimatePresence mode="wait">
          
          {/* MAP & DICE TAB */}
          {activeTab === "map" && (
            <motion.div 
              key="map"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 pb-20 bg-[#380b0b] flex flex-col items-center justify-start overflow-y-auto"
            >
              {/* Responsive Container for Mobile/Tablet */}
              <div className="w-full aspect-[4/5] sm:aspect-square relative bg-black/50 rounded-b-xl border-b-2 border-slate-800 shadow-[0_0_30px_rgba(0,0,0,0.8)] flex-shrink-0 flex items-center justify-center overflow-hidden">
                 <img src={boardImg} alt="Map" className="w-full h-full object-contain pointer-events-none" />
                 
                 {/* Optional Center Image Overlay */}
                 {centerImage && (
                   <div className="absolute top-[48%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] pointer-events-none z-10 flex items-center justify-center">
                     <img src={centerImage} alt="Center Logo" className="max-w-full max-h-full object-contain drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]" />
                   </div>
                 )}
                 
                 {/* Current position indicator */}
                 <div className="absolute top-[35%] left-[45%] -translate-x-1/2 -translate-y-1/2 w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-slate-900 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)] flex items-center justify-center animate-bounce z-20">
                    <Crosshair className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                 </div>

                 {/* Center Area for Dice (Only on My Turn) */}
                 {isMyTurn && (
                   <div className="absolute top-[46%] left-[49%] -translate-x-1/2 -translate-y-1/2 z-30 scale-[0.45] sm:scale-[0.55] origin-center">
                     <DiceAnimation onRollComplete={(val) => console.log('Rolled:', val)} />
                   </div>
                 )}

                 {/* Card Modal Overlay */}
                 <AnimatePresence>
                   {selectedCard && (
                     <motion.div 
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       exit={{ opacity: 0 }}
                       className="absolute inset-0 bg-black/80 z-40 flex items-center justify-center p-6 backdrop-blur-sm"
                       onClick={() => {
                         setSelectedCard(null);
                         setCardFlipped(false);
                       }}
                     >
                       <motion.div 
                         initial={{ scale: 0.8, y: 20 }}
                         animate={{ scale: 1, y: 0, rotateY: cardFlipped ? 180 : 0 }}
                         exit={{ scale: 0.8, opacity: 0 }}
                         transition={{ duration: 0.4, type: "spring" }}
                         onClick={(e) => { e.stopPropagation(); setCardFlipped(!cardFlipped); }}
                         className={`w-48 aspect-[2.5/3.5] rounded-xl border-4 ${selectedCard.color} shadow-[0_0_30px_rgba(0,0,0,0.8)] relative cursor-pointer [transform-style:preserve-3d]`}
                       >
                         {/* Front of card */}
                         <div className={`absolute inset-0 [backface-visibility:hidden] flex flex-col items-center justify-start text-center ${selectedCard.bg} bg-opacity-90 overflow-hidden rounded-lg`}>
                           <div className="w-full h-[60%] bg-black/40 border-b border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden">
                             {selectedCard.image ? (
                               <img src={selectedCard.image} alt={selectedCard.name} className="w-full h-full object-cover opacity-90" />
                             ) : (
                               <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center border border-slate-700">
                                 {selectedCard.type === catNames.c1 && <User className="w-6 h-6 text-slate-300" />}
                                 {selectedCard.type === catNames.c2 && <Box className="w-6 h-6 text-slate-300" />}
                                 {selectedCard.type === catNames.c3 && <MapPin className="w-6 h-6 text-slate-300" />}
                               </div>
                             )}
                           </div>
                           <div className="w-full flex-1 flex flex-col items-center justify-center p-2">
                             <h4 className="font-bold text-sm tracking-widest uppercase text-white drop-shadow-md leading-tight line-clamp-2 px-1">{selectedCard.name}</h4>
                             <span className="text-[9px] uppercase tracking-widest text-slate-400 mt-2 bg-black/50 px-2 py-1 rounded border border-slate-800">{selectedCard.type}</span>
                           </div>
                         </div>
                         
                         {/* Back of card */}
                         <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col items-center justify-center p-4 text-center bg-slate-950 border border-slate-700">
                           <h4 className="font-bold text-xs tracking-widest uppercase text-slate-300 mb-4 border-b border-slate-800 pb-2 w-full">{selectedCard.name}</h4>
                           <p className="text-xs text-slate-400 leading-relaxed font-mono">{selectedCard.desc}</p>
                           <div className="mt-auto text-[8px] text-cyan-500 uppercase tracking-widest animate-pulse flex gap-1 items-center">
                              Toca para voltear
                           </div>
                         </div>
                       </motion.div>
                     </motion.div>
                   )}
                 </AnimatePresence>
              </div>
              
              {/* Inventory Cards List */}
              <div className="w-full flex-1 p-4 flex flex-col gap-3 min-h-[160px]">
                <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-2">
                  <Database className="w-3 h-3" /> INVENTARIO DE CARTAS
                </h3>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
                  {MOCK_CARDS.map(card => (
                    <div 
                      key={card.id} 
                      onClick={() => { setSelectedCard(card); setCardFlipped(false); }}
                      className={`w-28 flex-shrink-0 aspect-[2.5/3.5] rounded-lg border-2 ${card.color} ${card.bg} bg-opacity-40 flex flex-col items-center justify-start cursor-pointer snap-center hover:scale-105 transition-transform shadow-lg relative overflow-hidden`}
                    >
                      <div className="w-full h-1/2 relative overflow-hidden border-b border-slate-800">
                        {card.image ? (
                          <img src={card.image} alt={card.name} className="w-full h-full object-cover opacity-80" />
                        ) : (
                          <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                            {card.type === catNames.c1 && <User className="w-5 h-5 text-slate-400 opacity-80" />}
                            {card.type === catNames.c2 && <Box className="w-5 h-5 text-slate-400 opacity-80" />}
                            {card.type === catNames.c3 && <MapPin className="w-5 h-5 text-slate-400 opacity-80" />}
                          </div>
                        )}
                        <div className="absolute top-0 right-0 w-6 h-6 bg-black/60 rounded-bl-full backdrop-blur-sm border-b border-l border-slate-700/50 flex items-start justify-end p-1">
                          {card.type === catNames.c1 && <User className="w-3 h-3 text-cyan-400" />}
                          {card.type === catNames.c2 && <Box className="w-3 h-3 text-emerald-400" />}
                          {card.type === catNames.c3 && <MapPin className="w-3 h-3 text-red-400" />}
                        </div>
                      </div>
                      <div className="p-2 w-full flex-1 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-center leading-tight text-slate-200 uppercase px-1 line-clamp-2">{card.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* MATRIX TAB */}
          {activeTab === "matrix" && (
            <motion.div 
              key="matrix"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="p-2 pb-24"
            >
              <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col shadow-inner shadow-black">
                
                {/* Fixed Header Row */}
                <div className="flex bg-slate-900 border-b border-slate-700 sticky top-0 z-20 shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                  <div className="w-32 flex-shrink-0 p-2 border-r border-slate-700 flex items-center justify-center bg-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold tracking-widest">ITEMS</span>
                  </div>
                  <div className="flex-1 flex overflow-x-auto scrollbar-none">
                    {TEAMS.map(team => {
                      const getTeamColor = (t: string) => {
                        const colors: Record<string, string> = { Rojo: 'bg-red-500', Amarillo: 'bg-yellow-500', Azul: 'bg-blue-500', Verde: 'bg-green-500', Morado: 'bg-purple-500', Blanco: 'bg-slate-200' };
                        return colors[t] || 'bg-slate-500';
                      };
                      return (
                      <div key={team} className="w-10 flex-shrink-0 border-r border-slate-800 flex items-center justify-center p-1">
                        <div className={`w-3 h-3 rounded-full ${getTeamColor(team)} opacity-80 shadow-[0_0_8px_currentColor]`}></div>
                      </div>
                    )})}
                  </div>
                </div>

                {/* Table Body */}
                <div className="overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-transparent">
                  {Object.entries(categories).map(([catKey, items]: [string, ElementoItem[]]) => {
                    const isC1 = catKey === 'c1';
                    const isC2 = catKey === 'c2';
                    const displayName = isC1 ? catNames.c1 : (isC2 ? catNames.c2 : catNames.c3);
                    
                    return (
                    <div key={catKey}>
                      {/* Category Header */}
                      <div className={`text-xs font-bold uppercase p-2 sticky left-0 z-10 border-y border-slate-800 ${
                        isC1 ? 'bg-blue-950/40 text-blue-400' :
                        isC2 ? 'bg-emerald-950/40 text-emerald-400' :
                        'bg-red-950/40 text-red-400'
                      }`}>
                        {displayName}
                      </div>
                      
                      {/* Items Rows */}
                      {items.map((item: ElementoItem) => {
                        const rowName = (!isC1 && !isC2 && item.motif) ? item.motif : item.name;
                        
                        return (
                        <div key={item.name} className="flex border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors">
                          <div className="w-32 flex-shrink-0 p-2 border-r border-slate-800 flex items-center gap-2 overflow-hidden bg-slate-950">
                            <div className="p-1 rounded-md border border-slate-800 bg-slate-900 flex-shrink-0">
                              {item.avatar}
                            </div>
                            <span className="text-[10px] text-slate-300 leading-tight truncate w-full" title={rowName}>{rowName}</span>
                          </div>
                          <div className="flex-1 flex overflow-x-auto scrollbar-none">
                            {TEAMS.map(team => {
                              const state = matrix[`${rowName}-${team}`] || 0;
                              return (
                                <button
                                  key={team}
                                  onClick={() => handleCellClick(rowName, team)}
                                  className={`w-10 h-10 flex-shrink-0 border-r border-slate-800 flex items-center justify-center transition-colors ${
                                    state === 2 ? 'bg-red-950/20' : state === 1 ? 'bg-orange-950/10' : 'bg-transparent'
                                  }`}
                                >
                                  {renderCellIcon(state)}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )})}
                    </div>
                  )})}
                </div>
              </div>
            </motion.div>
          )}

          {/* NOTES TAB */}
          {activeTab === "notes" && (
            <motion.div 
              key="notes"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="p-4 pb-24 h-full flex flex-col"
            >
              <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-1 relative overflow-hidden">
                <div className="absolute top-0 left-8 bottom-0 w-[1px] bg-red-900/30 z-0"></div>
                <textarea 
                  className="w-full h-full bg-transparent resize-none p-4 pl-12 text-sm text-cyan-200 focus:outline-none z-10 relative font-mono leading-[32px] placeholder:text-slate-600"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, rgba(15, 23, 42, 0.8) 31px, rgba(15, 23, 42, 0.8) 32px)',
                    backgroundAttachment: 'local'
                  }}
                  placeholder="Inicia registro de análisis lógico..."
                  spellCheck="false"
                ></textarea>
              </div>
            </motion.div>
          )}

          {/* SUGGEST TAB */}
          {activeTab === "suggest" && (
            <motion.div 
              key="suggest"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="p-4 pb-24 flex flex-col gap-6"
            >
              <div className="bg-slate-900/80 border border-cyan-900/50 rounded-xl p-6 shadow-lg shadow-black flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold tracking-widest uppercase text-emerald-400">Lanzar</h3>
                  </div>
                  <select 
                    value={suggestMode}
                    onChange={(e) => setSuggestMode(e.target.value)}
                    className="bg-slate-950 border border-cyan-900/50 rounded p-1 text-[10px] text-cyan-400 outline-none focus:border-cyan-500 font-bold uppercase tracking-widest"
                  >
                    <option value="hipotesis">Hipótesis</option>
                    <option value="acusacion">Acusación Final</option>
                  </select>
                </div>

                {/* 1. Selector de Espacios (C3) - CORREGIDO: Eliminados paréntesis triples */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase text-slate-500 flex items-center gap-2"><MapPin className="w-3 h-3"/> {catNames.c3} (Actual)</label>
                  <select 
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    disabled={suggestMode === "hipotesis"}
                    className={`w-full bg-slate-900 border border-slate-800 focus:border-cyan-400 rounded-lg p-3 text-sm text-cyan-100 appearance-none outline-none focus:ring-1 focus:ring-cyan-500 transition-colors ${suggestMode === 'hipotesis' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <option value="" disabled>Selecciona...</option>
                    {/* SINTAXIS CORRECTA: (e: ElementoItem) => ... */}
                    {categories.c3.map((e: ElementoItem) => (
                      <option key={e.name} value={e.name}>{e.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Selector de Sujetos (C1) - CORREGIDO: Cambiado 'any' por 'ElementoItem' */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase text-cyan-500 flex items-center gap-2"><User className="w-3 h-3"/> {catNames.c1}</label>
                  <select defaultValue="" className="w-full bg-slate-900 border border-cyan-800 focus:border-cyan-400 rounded-lg p-3 text-sm text-cyan-100 appearance-none outline-none focus:ring-1 focus:ring-cyan-500 transition-colors">
                    <option value="" disabled>Selecciona...</option>
                    {categories.c1.map((s: ElementoItem) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

{/* 3. Selector de Objetos (C2) - CORREGIDO: Cambiado 'any' por 'ElementoItem' */}
<div className="flex flex-col gap-2">
  <label className="text-[10px] uppercase text-emerald-500 flex items-center gap-2"><Box className="w-3 h-3"/> {catNames.c2}</label>
  <select defaultValue="" className="w-full bg-slate-900 border border-emerald-800 focus:border-emerald-400 rounded-lg p-3 text-sm text-emerald-100 appearance-none outline-none focus:ring-1 focus:ring-emerald-500 transition-colors">
    <option value="" disabled>Selecciona...</option>
    {categories.c2.map((o: ElementoItem) => (
      <option key={o.name} value={o.name}>{o.name}</option>
    ))}
  </select>
</div>

                <button className={`w-full mt-4 text-slate-950 font-bold uppercase tracking-widest py-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 ${
                  suggestMode === "hipotesis" 
                    ? "bg-cyan-600 hover:bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.4)]" 
                    : "bg-red-600 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                }`}>
                   {suggestMode === "hipotesis" ? "Lanzar Hipótesis" : "Realizar Acusación"}
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      <div className="bg-slate-950 border-t border-cyan-900/50 flex justify-around p-2 pb-6 absolute bottom-0 w-full z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        {[
          { id: "map", icon: MapIcon, label: "MAPA" },
          { id: "matrix", icon: Search, label: "MATRIZ" },
          { id: "notes", icon: FileText, label: "NOTAS" },
          { id: "suggest", icon: MessageSquare, label: "SUGERIR/ACUSAR" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              activeTab === tab.id 
                ? "text-cyan-400 scale-110 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" 
                : "text-slate-600 hover:text-slate-400"
            }`}
          >
            <tab.icon className="w-6 h-6" strokeWidth={activeTab === tab.id ? 2.5 : 1.5} />
            <span className="text-[9px] font-bold tracking-widest uppercase">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

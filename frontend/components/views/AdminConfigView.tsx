import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Plus, Settings, User, Box, MapPin, KeyRound, Clock, Target, Save, FileText, Upload, List, Trash2 } from "lucide-react";

interface Item {
  id: string;
  name: string;
  desc: string;
  imageUrl?: string;
  motif?: string;
}

interface GameConfig {
  id: string;
  name: string;
  gameTitle: string;
  objective: string;
  duration: string;
  centerImage: string;
  cat1Name: string;
  cat2Name: string;
  cat3Name: string;
  hasMotifs?: boolean;
  subjects: Item[];
  objects: Item[];
  spaces: Item[];
  createdAt: number;
}

const DEFAULT_SPACES: Item[] = [
  { id: "s1", name: "Cámara Anecoica", desc: "Aislamiento de señales y pruebas de campo.", imageUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=400&fit=crop" },
  { id: "s2", name: "Sala Hedy Lamarr", desc: "Laboratorio de investigación espectral.", imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=400&fit=crop" },
  { id: "s3", name: "C. Conmutación", desc: "Nodo central de enrutamiento.", imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?q=80&w=400&fit=crop" },
  { id: "s4", name: "Seminario Haykin", desc: "Análisis de sistemas cognitivos.", imageUrl: "https://images.unsplash.com/photo-1516110833967-0b5716ca1387?q=80&w=400&fit=crop" },
  { id: "s5", name: "Club de radio", desc: "Transmisiones de banda aficionada.", imageUrl: "https://images.unsplash.com/photo-1614729939124-032f0b56c9ce?q=80&w=400&fit=crop" },
  { id: "s6", name: "L. Com. Ópticas", desc: "Experimentación con fibra óptica.", imageUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&fit=crop" },
  { id: "s7", name: "L. Electrónica", desc: "Montaje y soldadura de componentes.", imageUrl: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?q=80&w=400&fit=crop" },
  { id: "s8", name: "Seminario Maxwell", desc: "Estudio de electromagnetismo avanzado.", imageUrl: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=400&fit=crop" },
  { id: "s9", name: "S. Torres Quevedo", desc: "Investigación en automatización.", imageUrl: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=400&fit=crop" }
];

export function AdminConfigView() {
  const [activeTab, setActiveTab] = useState("list");
  
  const [configs, setConfigs] = useState<GameConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);

  // Settings State for currently edited config
  const [configName, setConfigName] = useState("Nueva Configuración");
  const [gameTitle, setGameTitle] = useState("Cluedo Online");
  const [objective, setObjective] = useState("Evaluación de resolución de problemas lógicos en entornos técnicos.");
  const [duration, setDuration] = useState("60");
  const [centerImage, setCenterImage] = useState("");
  const [cat1Name, setCat1Name] = useState("Sujetos");
  const [cat2Name, setCat2Name] = useState("Objetos");
  const [cat3Name, setCat3Name] = useState("Espacios");
  const [hasMotifs, setHasMotifs] = useState(false);

  // Triples State
  const [subjects, setSubjects] = useState<Item[]>([
    { id: "su1", name: "Ada Lovelace", desc: "Primera programadora, especialista en algoritmos.", imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400&fit=crop" },
    { id: "su2", name: "Alan Turing", desc: "Criptoanalista y padre de la computación.", imageUrl: "https://images.unsplash.com/photo-1518208082370-ca711536f966?q=80&w=400&fit=crop" }
  ]);
  const [objects, setObjects] = useState<Item[]>([
    { id: "ob1", name: "Osciloscopio Letal", desc: "Emitió un pulso de alto voltaje no detectado.", imageUrl: "https://images.unsplash.com/photo-1764493824846-8934b7387f2e?q=80&w=400&fit=crop" },
    { id: "ob2", name: "Cable de Fibra", desc: "Usado como ligadura invisible al ojo humano.", imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?q=80&w=400&fit=crop" }
  ]);
  const [spaces, setSpaces] = useState<Item[]>(DEFAULT_SPACES);

  useEffect(() => {
    const savedConfigs = localStorage.getItem("gameConfigs");
    if (savedConfigs) {
      setConfigs(JSON.parse(savedConfigs));
    }
  }, []);

  const loadConfig = (config: GameConfig) => {
    setActiveConfigId(config.id);
    setConfigName(config.name);
    setGameTitle(config.gameTitle);
    setObjective(config.objective);
    setDuration(config.duration);
    setCenterImage(config.centerImage);
    setCat1Name(config.cat1Name || "Sujetos");
    setCat2Name(config.cat2Name || "Objetos");
    setCat3Name(config.cat3Name || "Espacios");
    setHasMotifs(config.hasMotifs || false);
    setSubjects(config.subjects);
    setObjects(config.objects);
    setSpaces(config.spaces);
    setActiveTab("general");
  };

  const createNewConfig = () => {
    setActiveConfigId(null);
    setConfigName("Nueva Configuración " + (configs.length + 1));
    setGameTitle("Cluedo Online");
    setObjective("Evaluación de resolución de problemas lógicos.");
    setDuration("60");
    setCenterImage("");
    setCat1Name("Sujetos");
    setCat2Name("Objetos");
    setCat3Name("Espacios");
    setHasMotifs(false);
    setSubjects([
      { id: "su1", name: "Ada Lovelace", desc: "Primera programadora.", imageUrl: "" }
    ]);
    setObjects([
      { id: "ob1", name: "Osciloscopio", desc: "Alto voltaje.", imageUrl: "" }
    ]);
    setSpaces(DEFAULT_SPACES);
    setActiveTab("general");
  };

  const deleteConfig = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = configs.filter(c => c.id !== id);
    setConfigs(updated);
    localStorage.setItem("gameConfigs", JSON.stringify(updated));
    if (activeConfigId === id) {
      setActiveTab("list");
      setActiveConfigId(null);
    }
  };

  const renderItemList = (items: Item[], setItems: React.Dispatch<React.SetStateAction<Item[]>>, icon: React.ReactNode, type: string, isFixed: boolean = false, hasMotif: boolean = false) => {
    const handleAdd = () => {
      setItems([...items, { id: Date.now().toString(), name: "Nuevo " + type, desc: "Descripción...", imageUrl: "" }]);
    };
    
    return (
      <div className="flex flex-col gap-4">
        {items.map((item, index) => (
          <div key={item.id} className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex gap-4 group hover:border-cyan-800 transition-colors relative">
            <div className="w-20 h-20 bg-slate-950 rounded border border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0 relative">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="text-slate-700 flex flex-col items-center gap-1">
                   {icon}
                   <span className="text-[8px] uppercase">Sin Imagen</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-2 text-cyan-500">
                {icon} <span className="text-xs font-bold uppercase">{type} {index + 1}</span>
                {!isFixed && (
                  <button 
                    onClick={() => setItems(items.filter(i => i.id !== item.id))}
                    className="ml-auto text-slate-600 hover:text-red-500 text-xs uppercase font-bold tracking-widest"
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input 
                  type="text" 
                  value={item.name}
                  onChange={(e) => {
                    const newItems = [...items];
                    newItems[index].name = e.target.value;
                    setItems(newItems);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded text-cyan-100 font-bold outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500" 
                  placeholder="Nombre..."
                />
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={item.imageUrl || ""}
                    onChange={(e) => {
                      const newItems = [...items];
                      newItems[index].imageUrl = e.target.value;
                      setItems(newItems);
                    }}
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 p-2 rounded text-cyan-100 text-xs outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 font-mono" 
                    placeholder="URL de imagen..."
                  />
                  <label className="flex items-center justify-center bg-slate-800 hover:bg-cyan-900 border border-slate-700 hover:border-cyan-500 rounded px-3 cursor-pointer transition-colors text-slate-400 hover:text-cyan-400" title="Subir imagen local">
                    <Upload className="w-4 h-4" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const newItems = [...items];
                            newItems[index].imageUrl = reader.result as string;
                            setItems(newItems);
                          };
                          reader.readAsDataURL(file);
                        }
                      }} 
                    />
                  </label>
                </div>
              </div>
              {hasMotif && (
                <input 
                  type="text" 
                  value={item.motif || ""}
                  onChange={(e) => {
                    const newItems = [...items];
                    newItems[index].motif = e.target.value;
                    setItems(newItems);
                  }}
                  className="w-full bg-slate-950 border border-purple-900/50 p-2 rounded text-purple-200 text-xs outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-500" 
                  placeholder="Motivo asociado a este espacio (Opcional)..."
                />
              )}
              <input 
                type="text" 
                value={item.desc}
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[index].desc = e.target.value;
                  setItems(newItems);
                }}
                className="w-full bg-slate-950 border border-slate-700 p-2 rounded text-slate-400 text-xs outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500" 
                placeholder="Descripción o pista..."
              />
            </div>
          </div>
        ))}
        {!isFixed && (
          <button 
            onClick={handleAdd}
            className="p-4 border border-dashed border-slate-700 rounded-lg text-slate-500 hover:text-cyan-400 hover:border-cyan-500 hover:bg-slate-900/50 flex items-center justify-center gap-2 transition-all font-bold tracking-widest uppercase text-xs"
          >
            <Plus className="w-4 h-4" /> Añadir {type}
          </button>
        )}
      </div>
    );
  };

  const handleSaveConfig = () => {
    const newConfig: GameConfig = {
      id: activeConfigId || Date.now().toString(),
      name: configName,
      gameTitle,
      objective,
      duration,
      centerImage,
      cat1Name,
      cat2Name,
      cat3Name,
      hasMotifs,
      subjects,
      objects,
      spaces,
      createdAt: Date.now()
    };

    let updatedConfigs;
    if (activeConfigId) {
      updatedConfigs = configs.map(c => c.id === activeConfigId ? newConfig : c);
    } else {
      updatedConfigs = [...configs, newConfig];
    }
    
    setConfigs(updatedConfigs);
    localStorage.setItem("gameConfigs", JSON.stringify(updatedConfigs));
    
    // Auto-select this as current global for quick fallback
    localStorage.setItem("duration", duration);
    localStorage.setItem("gameTitle", gameTitle);
    localStorage.setItem("centerImage", centerImage);
    localStorage.setItem("activeConfig", JSON.stringify(newConfig));
    
    setActiveTab("list");
  };

  return (
    <div className="flex w-full min-h-screen bg-[#020617] text-cyan-400 font-mono overflow-hidden">
      
      {/* Sidebar Navigation */}
      <div className="w-[320px] h-screen bg-slate-900/40 border-r border-cyan-800/50 flex flex-col z-20 sticky top-0">
        <div className="p-6 border-b border-cyan-800/50 bg-slate-900/60 flex items-center gap-4">
          <Link to="/" className="text-slate-500 hover:text-cyan-400 transition-colors p-2 rounded-md hover:bg-slate-800">
             <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-emerald-400">ADMINISTRACIÓN</h1>
            <p className="text-[10px] text-slate-500">CONFIGURAR CLUEDOSKIN</p>
          </div>
        </div>

        <nav className="p-4 flex flex-col gap-2 flex-1 overflow-y-auto">
          <button onClick={() => setActiveTab("list")} className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-xs font-bold tracking-widest uppercase ${activeTab === 'list' ? 'bg-indigo-950/30 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
            <List className="w-4 h-4" /> Mis Configuraciones
          </button>
          
          {activeTab !== 'list' && (
            <>
              <div className="my-2 border-t border-slate-800"></div>

              <button onClick={() => setActiveTab("general")} className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-xs font-bold tracking-widest uppercase ${activeTab === 'general' ? 'bg-cyan-950/30 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
                <Settings className="w-4 h-4" /> Ajustes Generales
              </button>
              <button onClick={() => setActiveTab("sujetos")} className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-xs font-bold tracking-widest uppercase ${activeTab === 'sujetos' ? 'bg-cyan-950/30 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
                <User className="w-4 h-4" /> Ternas: {cat1Name} ({subjects.length})
              </button>
              <button onClick={() => setActiveTab("objetos")} className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-xs font-bold tracking-widest uppercase ${activeTab === 'objetos' ? 'bg-emerald-950/30 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
                <Box className="w-4 h-4" /> Ternas: {cat2Name} ({objects.length})
              </button>
              <button onClick={() => setActiveTab("espacios")} className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-xs font-bold tracking-widest uppercase ${activeTab === 'espacios' ? 'bg-red-950/30 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
                <MapPin className="w-4 h-4" /> Ternas: {cat3Name} ({spaces.length})
              </button>
            </>
          )}
        </nav>

        <div className="p-6 border-t border-cyan-800/50 bg-slate-900/80">
          <button onClick={handleSaveConfig} className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold uppercase tracking-widest py-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
             <Save className="w-5 h-5" /> Guardar Configuración
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 to-[#020617] p-10">
        <AnimatePresence mode="wait">
          
          {activeTab === 'list' && (
            <motion.div key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-4xl flex flex-col gap-8">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-widest text-indigo-400 mb-2 flex items-center gap-3"><List className="text-indigo-500 w-8 h-8"/> Historial de Configuraciones</h2>
                  <p className="text-slate-400 text-sm">Gestiona y edita los presets de partida que utilizará el Game Master.</p>
                </div>
                <button onClick={createNewConfig} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all uppercase text-xs tracking-widest">
                  <Plus className="w-4 h-4" /> Crear Nueva
                </button>
              </div>

              {configs.length === 0 ? (
                <div className="p-12 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-4">
                  <List className="w-12 h-12 opacity-50" />
                  <p>No hay configuraciones guardadas.</p>
                  <button onClick={createNewConfig} className="text-indigo-400 hover:underline">Comienza creando una aquí</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {configs.map(config => (
                    <div key={config.id} onClick={() => loadConfig(config)} className="bg-slate-900/60 border border-slate-700 hover:border-indigo-500 p-6 rounded-xl cursor-pointer group transition-all relative">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">{config.name}</h3>
                        <button onClick={(e) => deleteConfig(config.id, e)} className="text-slate-600 hover:text-red-500 transition-colors p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-2 text-sm text-slate-400">
                        <p><span className="text-slate-500">Título:</span> {config.gameTitle}</p>
                        <p><span className="text-slate-500">Duración:</span> {config.duration} min</p>
                        <div className="flex gap-4 mt-2 pt-2 border-t border-slate-800 text-xs">
                          <span className="flex items-center gap-1"><User className="w-3 h-3 text-cyan-500"/> {config.subjects.length}</span>
                          <span className="flex items-center gap-1"><Box className="w-3 h-3 text-emerald-500"/> {config.objects.length}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-red-500"/> {config.spaces.length}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'general' && (
            <motion.div key="general" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-3xl flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-2 flex items-center gap-3"><Settings className="text-cyan-500 w-8 h-8"/> Ajustes de la Sesión</h2>
                <p className="text-slate-400 text-sm">Configura los ajustes globales que guiarán la lógica de la partida y la evaluación de los equipos.</p>
              </div>

              <div className="p-6 bg-slate-900/50 border border-cyan-900/50 rounded-xl flex flex-col gap-6 shadow-[0_0_30px_-5px_rgba(0,0,0,0.5)]">
                
                {/* Config Name */}
                <div className="flex flex-col gap-2 border-b border-slate-800 pb-6">
                  <label className="text-[10px] uppercase text-indigo-400 flex items-center gap-2 font-bold tracking-widest"><FileText className="w-4 h-4"/> Nombre de la cluedoskin</label>
                  <input 
                    type="text" 
                    value={configName} 
                    onChange={e => setConfigName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-indigo-100 font-bold outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Ej. Clásico IT v1"
                  />
                </div>

                {/* Title Config */}
                <div className="flex flex-col gap-2 border-b border-slate-800 pb-6">
                  <label className="text-[10px] uppercase text-cyan-500 flex items-center gap-2 font-bold tracking-widest"><Settings className="w-4 h-4"/> Título de la Partida Pública</label>
                  <input 
                    type="text" 
                    value={gameTitle} 
                    onChange={e => setGameTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500"
                    placeholder="Ej. Cluedo Online"
                  />
                </div>

                {/* Center Image Config */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase text-cyan-500 flex items-center gap-2 font-bold tracking-widest"><KeyRound className="w-4 h-4"/> Imagen Central del Mapa (Logo)</label>
                  <div className="flex gap-4">
                    <input 
                      type="text" 
                      value={centerImage}
                      onChange={e => {
                        setCenterImage(e.target.value);
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 font-mono" 
                      placeholder="URL de la imagen central..."
                    />
                    <label className="px-6 bg-slate-800 hover:bg-cyan-900 text-cyan-400 border border-cyan-800 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors shadow-inner flex flex-col items-center justify-center cursor-pointer">
                      Subir
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setCenterImage(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }} 
                      />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Sube una imagen para sustituir el texto de "Muerte de una Ingenia" en el centro del tablero.</p>
                </div>

                {/* Categories Naming Config */}
                <div className="flex flex-col gap-4 mt-4 border-t border-slate-800 pt-6">
                  <label className="text-[10px] uppercase text-purple-400 flex items-center gap-2 font-bold tracking-widest"><Target className="w-4 h-4"/> Nombres de Categorías (Ternas)</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase mb-1 block">Terna 1</span>
                      <input type="text" value={cat1Name} onChange={e => setCat1Name(e.target.value)} placeholder="Ej. Sujetos" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-cyan-100 font-bold outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-500" />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase mb-1 block">Terna 2</span>
                      <input type="text" value={cat2Name} onChange={e => setCat2Name(e.target.value)} placeholder="Ej. Objetos" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-emerald-100 font-bold outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-500" />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase mb-1 block">Terna 3</span>
                      <input type="text" value={cat3Name} onChange={e => setCat3Name(e.target.value)} placeholder="Ej. Espacios" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-red-100 font-bold outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-500" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                    <input 
                      type="checkbox" 
                      id="hasMotifs"
                      checked={hasMotifs} 
                      onChange={e => setHasMotifs(e.target.checked)} 
                      className="w-4 h-4 rounded border-slate-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-950 bg-slate-950" 
                    />
                    <label htmlFor="hasMotifs" className="text-xs text-slate-300 cursor-pointer">
                      Habilitar "Motivos" (Los espacios estarán asociados a motivos específicos)
                    </label>
                  </div>
                </div>

                {/* Duration */}
                <div className="flex flex-col gap-2 mt-4 border-t border-slate-800 pt-6">
                  <label className="text-[10px] uppercase text-cyan-500 flex items-center gap-2 font-bold tracking-widest"><Clock className="w-4 h-4"/> Duración Estimada (Minutos)</label>
                  <input 
                    type="number" 
                    value={duration} 
                    onChange={e => setDuration(e.target.value)}
                    className="w-1/3 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                {/* Objective */}
                <div className="flex flex-col gap-2 mt-4 border-t border-slate-800 pt-6">
                  <label className="text-[10px] uppercase text-cyan-500 flex items-center gap-2 font-bold tracking-widest"><Target className="w-4 h-4"/> Objetivo de Evaluación</label>
                  <textarea 
                    value={objective}
                    onChange={e => setObjective(e.target.value)}
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-slate-300 text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500 resize-none font-mono leading-relaxed"
                  ></textarea>
                  <p className="text-[10px] text-slate-500 mt-1">Este objetivo será visible en la pantalla central para recordar el propósito de la actividad.</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'sujetos' && (
            <motion.div key="sujetos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-3xl flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-cyan-400 mb-2 flex items-center gap-3"><User className="w-8 h-8"/> Configurar Sujetos</h2>
                <p className="text-slate-400 text-sm">Define los perfiles de los sospechosos que los equipos deberán analizar en la matriz de razonamiento.</p>
              </div>
              {renderItemList(subjects, setSubjects, <User className="w-4 h-4"/>, "Sujeto")}
            </motion.div>
          )}

          {activeTab === 'objetos' && (
            <motion.div key="objetos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-3xl flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-emerald-400 mb-2 flex items-center gap-3"><Box className="w-8 h-8"/> Configurar Objetos</h2>
                <p className="text-slate-400 text-sm">Establece las herramientas o elementos técnicos que formarán parte de la hipótesis de la terna.</p>
              </div>
              {renderItemList(objects, setObjects, <Box className="w-4 h-4"/>, "Objeto")}
            </motion.div>
          )}

          {activeTab === 'espacios' && (
            <motion.div key="espacios" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-3xl flex flex-col gap-8">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-red-400 mb-2 flex items-center gap-3"><MapPin className="w-8 h-8"/> Configurar Espacios</h2>
                <p className="text-slate-400 text-sm">Define las salas o zonas de interés del tablero donde los jugadores podrán moverse y formular sus sugerencias.</p>
              </div>
              {renderItemList(spaces, setSpaces, <MapPin className="w-4 h-4"/>, cat3Name, true, hasMotifs)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
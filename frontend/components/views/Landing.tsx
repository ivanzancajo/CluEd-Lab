import { useState, useEffect } from "react";
import { isAxiosError } from "axios";
import { Link, useNavigate } from "react-router";
import { Monitor, Terminal as TerminalIcon, Cpu, Fingerprint, Settings, Zap, Lock, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import api from "../../src/lib/api";// Importamos nuestra instancia de Axios configurada
import { hasStoredAdminSession, storeAdminToken } from "../../src/lib/auth";

const DEFAULT_GAME_TITLE = "ClueLab Creator";
const LEGACY_GAME_TITLE = "Cluedo Online";

export function Landing() {
  const [gameTitle, setGameTitle] = useState(DEFAULT_GAME_TITLE);
  const [pendingAdminPath, setPendingAdminPath] = useState("/host");
  
  // Estados para el Login (CU00)
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    const savedTitle = localStorage.getItem("gameTitle");

    if (savedTitle && savedTitle !== LEGACY_GAME_TITLE) {
      setGameTitle(savedTitle);
      return;
    }

    if (savedTitle === LEGACY_GAME_TITLE) {
      localStorage.setItem("gameTitle", DEFAULT_GAME_TITLE);
    }

    setGameTitle(DEFAULT_GAME_TITLE);
  }, []);

  // Función de Autenticación
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await api.post('/auth/login', { username, password });
      storeAdminToken(response.data.token);
      
      // Si el login es correcto, cerramos el modal y vamos a la pantalla solicitada
      setShowLogin(false);
      navigate(pendingAdminPath);
    } catch (error) {
      if (isAxiosError<{ error?: string }>(error)) {
        if (error.response?.status === 401) {
          setError(error.response.data?.error || "Credenciales inválidas. Acceso denegado.");
        } else if (!error.response) {
          setError("No se puede contactar con el backend. Verifica que el servidor esté levantado en localhost:4000.");
        } else {
          setError(error.response.data?.error || "No se pudo completar el inicio de sesión.");
        }
      } else {
        setError("No se pudo completar el inicio de sesión.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Verificador de acceso: si hay token va directo, si no, abre el login
  const handleAdminAccess = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    if (hasStoredAdminSession()) {
      navigate(path);
    } else {
      setPendingAdminPath(path);
      setShowLogin(true);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.18),_transparent_28%),linear-gradient(180deg,#020617_0%,#020617_38%,#000000_100%)] px-6 py-10 text-slate-100 sm:px-8">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCAyMGgyMHYtMUgwem0xOSAwSDIwaC0xdjIwSDB6IiBmaWxsPSJyZ2JhKDMsIDEwNSwgMTYxLCAwLjA1KSIvPgo8L3N2Zz4=')] opacity-50 z-0"></div>
      <div className="absolute -left-16 top-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl"></div>
      <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"></div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex max-w-3xl flex-col items-center gap-5 text-center"
      >
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-800/60 bg-slate-950/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-300 shadow-[0_0_30px_rgba(6,182,212,0.12)] backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]"></span>
          Sistema de juego operativo
        </div>
        <div className="p-4 bg-cyan-950/30 border border-cyan-800 rounded-full shadow-[0_0_30px_rgba(6,182,212,0.15)]">
          <Fingerprint className="w-16 h-16 text-cyan-400" />
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 drop-shadow-[0_0_15px_rgba(45,212,191,0.5)] uppercase break-words px-4">
          {gameTitle}
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
          Centro de control para administrar la experiencia, abrir sesiones y lanzar la partida desde una interfaz unificada con acceso protegido para el Game Master.
        </p>
      </motion.div>

      <div className="relative z-10 mt-6 grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Botones protegidos: Usamos onClick en lugar de Link directo */}
        <button onClick={(e) => handleAdminAccess(e, '/config')} className="group relative flex min-h-[260px] flex-col items-start justify-between overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/55 p-8 text-left transition-all duration-300 hover:-translate-y-2 hover:border-purple-500 hover:bg-slate-800/85 hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.3)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
          <div className="rounded-2xl border border-purple-900/50 bg-purple-950/20 p-4">
            <Settings className="w-10 h-10 text-slate-500 group-hover:text-purple-400 transition-colors" />
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-purple-300/80">Panel administrativo</p>
            <h2 className="text-2xl font-bold text-slate-200 group-hover:text-white">Configurar CluedoSkin</h2>
            <p className="text-sm leading-6 text-slate-400 group-hover:text-slate-300">Accede a la administración para editar la cluedoskin, categorías, recursos visuales y parámetros de partida.</p>
          </div>
        </button>

        <button onClick={(e) => handleAdminAccess(e, '/host')} className="group relative flex min-h-[260px] flex-col items-start justify-between overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/55 p-8 text-left transition-all duration-300 hover:-translate-y-2 hover:border-yellow-500 hover:bg-slate-800/85 hover:shadow-[0_0_40px_-10px_rgba(234,179,8,0.3)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-400/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
          <div className="rounded-2xl border border-yellow-900/50 bg-yellow-950/15 p-4">
            <Zap className="w-10 h-10 text-slate-500 group-hover:text-yellow-400 transition-colors" />
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-yellow-200/80">Control de partida</p>
            <h2 className="text-2xl font-bold text-slate-200 group-hover:text-white">Crear Sesión</h2>
            <p className="text-sm leading-6 text-slate-400 group-hover:text-slate-300">Genera el código, habilita la partida y controla la sala de espera antes de iniciar el tablero central.</p>
          </div>
        </button>

        <button onClick={(e) => handleAdminAccess(e, '/lobby')} className="group relative flex min-h-[260px] flex-col items-start justify-between overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/55 p-8 text-left transition-all duration-300 hover:-translate-y-2 hover:border-cyan-500 hover:bg-slate-800/85 hover:shadow-[0_0_40px_-10px_rgba(6,182,212,0.3)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
          <div className="rounded-2xl border border-cyan-900/50 bg-cyan-950/20 p-4">
            <Monitor className="w-10 h-10 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-300/80">Vista de sala</p>
            <h2 className="text-2xl font-bold text-slate-200 group-hover:text-white">Sala de Espera</h2>
            <p className="text-sm leading-6 text-slate-400 group-hover:text-slate-300">Observa como se unen los equipos y activa la pantalla central solo cuando el Game Master lo decida.</p>
          </div>
        </button>
        
        <Link to="/join" className="group relative flex min-h-[260px] flex-col items-start justify-between overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/55 p-8 text-left transition-all duration-300 hover:-translate-y-2 hover:border-emerald-500 hover:bg-slate-800/85 hover:shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
          <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4">
            <TerminalIcon className="w-10 h-10 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-300/80">Terminal de equipo</p>
            <h2 className="text-2xl font-bold text-slate-200 group-hover:text-white">Unirse a Sesión</h2>
            <p className="text-sm leading-6 text-slate-400 group-hover:text-slate-300">Conecta un terminal de equipo mediante código de sesión y accede al tablero de interacción.</p>
          </div>
        </Link>
      </div>

      <div className="relative z-10 mt-8 flex items-center justify-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-center text-[11px] uppercase tracking-[0.28em] text-slate-500 backdrop-blur-sm">
        <Cpu className="w-4 h-4" /> V2.4.1 Secure Kernel Activated
      </div>

      {/* Modal de Login */}
      <AnimatePresence>
        {showLogin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-cyan-800 rounded-2xl p-8 max-w-md w-full relative shadow-[0_0_50px_rgba(6,182,212,0.2)]"
            >
              <button 
                onClick={() => setShowLogin(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="flex flex-col items-center mb-6">
                <div className="p-3 bg-red-500/10 rounded-full mb-3">
                  <Lock className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Acceso Restringido</h2>
                <p className="text-slate-400 text-sm mt-1">Identificación de Game Master requerida</p>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <input 
                    type="text" 
                    placeholder="Identificador" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <input 
                    type="password" 
                    placeholder="Clave de seguridad" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    required
                  />
                </div>

                {error && (
                  <div className="text-red-400 text-sm text-center bg-red-400/10 py-2 rounded">
                    {error}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="mt-2 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Autenticando...' : 'Validar'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
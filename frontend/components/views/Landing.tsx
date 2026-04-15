import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Monitor, Terminal as TerminalIcon, Cpu, Fingerprint, Settings, Zap, Lock, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import api from "../../src/lib/api";// Importamos nuestra instancia de Axios configurada

export function Landing() {
  const [gameTitle, setGameTitle] = useState("Cluedo Online");
  
  // Estados para el Login (CU00)
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    const savedTitle = localStorage.getItem("gameTitle");
    if (savedTitle) {
      setGameTitle(savedTitle);
    }
  }, []);

  // Función de Autenticación
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await api.post('/auth/login', { username, password });
      localStorage.setItem('adminToken', response.data.token);
      
      // Si el login es correcto, cerramos el modal y vamos al host
      setShowLogin(false);
      navigate('/host'); 
    } catch {
      setError("Credenciales inválidas. Acceso denegado.");
    } finally {
      setIsLoading(false);
    }
  };

  // Verificador de acceso: si hay token va directo, si no, abre el login
  const handleAdminAccess = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    const token = localStorage.getItem('adminToken');
    if (token) {
      navigate(path);
    } else {
      setShowLogin(true);
    }
  };

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
        {/* Botones protegidos: Usamos onClick en lugar de Link directo */}
        <button onClick={(e) => handleAdminAccess(e, '/config')} className="group flex flex-col items-center justify-center p-10 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-purple-500 rounded-2xl transition-all duration-300 hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.3)] hover:-translate-y-2">
          <Settings className="w-16 h-16 mb-6 text-slate-500 group-hover:text-purple-400 transition-colors" />
          <h2 className="text-xl font-bold text-slate-300 group-hover:text-white text-center">Configurar CluedoSkin</h2>
        </button>

        <button onClick={(e) => handleAdminAccess(e, '/host')} className="group flex flex-col items-center justify-center p-10 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-yellow-500 rounded-2xl transition-all duration-300 hover:shadow-[0_0_40px_-10px_rgba(234,179,8,0.3)] hover:-translate-y-2">
          <Zap className="w-16 h-16 mb-6 text-slate-500 group-hover:text-yellow-400 transition-colors" />
          <h2 className="text-xl font-bold text-slate-300 group-hover:text-white text-center">Crear Sesión</h2>
        </button>

        {/* Botones públicos: Se mantienen con Link */}
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
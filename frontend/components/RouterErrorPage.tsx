import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Failed to fetch dynamically imported module") ||
    error.message.includes("Importing a module script failed") ||
    error.name === "ChunkLoadError"
  );
}

export function RouterErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  const chunkError = isChunkLoadError(error);

  let title = "Error inesperado";
  let message = "Ha ocurrido un error en la aplicación.";
  let status: number | null = null;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      title = "Página no encontrada";
      message = "La ruta que buscas no existe.";
    } else if (error.status === 403) {
      title = "Acceso denegado";
      message = "No tienes permiso para acceder a esta sección.";
    } else {
      message = error.data?.message ?? error.statusText ?? message;
    }
  } else if (chunkError) {
    title = "Error de carga";
    message =
      "No se pudo cargar una parte de la aplicación. Esto puede ocurrir tras una actualización. Recarga la página para continuar.";
  } else if (error instanceof Error) {
    message = error.message;
  }

  function handleReload() {
    window.location.reload();
  }

  function handleHome() {
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <AlertTriangle className="w-16 h-16 text-amber-400" />
        </div>

        {status && (
          <p className="text-slate-500 font-mono text-sm uppercase tracking-widest">
            Error {status}
          </p>
        )}

        <h1 className="text-2xl font-bold text-cyan-300 font-mono uppercase tracking-[0.15em]">
          {title}
        </h1>

        <p className="text-slate-400 font-mono text-sm leading-relaxed">{message}</p>

        <div className="flex gap-3 justify-center pt-2">
          {chunkError ? (
            <button
              onClick={handleReload}
              className="flex items-center gap-2 px-5 py-2.5 bg-cyan-700 hover:bg-cyan-600 text-white font-mono text-sm uppercase tracking-wider rounded transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Recargar página
            </button>
          ) : (
            <>
              <button
                onClick={handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-sm uppercase tracking-wider rounded transition-colors border border-slate-700"
              >
                <RefreshCw className="w-4 h-4" />
                Recargar
              </button>
              <button
                onClick={handleHome}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white font-mono text-sm uppercase tracking-wider rounded transition-colors"
              >
                <Home className="w-4 h-4" />
                Inicio
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

export function useExitGuard(active: boolean) {
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);

  return {
    showConfirm,
    openConfirm: () => setShowConfirm(true),
    cancelExit: () => setShowConfirm(false),
  };
}

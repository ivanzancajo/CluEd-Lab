import { useCallback, useRef, useState } from "react";

const ZOOM_MIN = 1.0;
const ZOOM_MAX = 3.0;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_PX = 32;

export const ZOOM_LIGHT_CONFIRM = 1.8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampPan(panX: number, panY: number, zoom: number, w: number, h: number) {
  if (zoom <= 1) return { panX: 0, panY: 0 };
  const maxX = w * (zoom - 1);
  const maxY = h * (zoom - 1);
  return {
    panX: clamp(panX, -maxX, 0),
    panY: clamp(panY, -maxY, 0),
  };
}

interface ZoomPanState {
  zoom: number;
  panX: number;
  panY: number;
}

export function useBoardZoomPan(containerRef: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<ZoomPanState>({ zoom: 1, panX: 0, panY: 0 });
  const surfaceRef = useRef<HTMLButtonElement>(null);

  // Gesture tracking refs (not state — no re-render needed)
  const gestureRef = useRef({
    isPinching: false,
    isPanning: false,
    lastPinchDist: 0,
    lastPinchMidX: 0,
    lastPinchMidY: 0,
    panStartX: 0,
    panStartY: 0,
    panStartStateX: 0,
    panStartStateY: 0,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
    // Snapshot of zoom/pan at gesture start for pinch
    pinchStartZoom: 1,
    pinchStartPanX: 0,
    pinchStartPanY: 0,
  });

  const getContainerSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { w: 0, h: 0 };
    const rect = el.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }, [containerRef]);

  const reverseTransform = useCallback(
    (screenX: number, screenY: number, currentState?: ZoomPanState): { positionX: number; positionY: number } => {
      const el = containerRef.current;
      if (!el) return { positionX: 0, positionY: 0 };
      const rect = el.getBoundingClientRect();
      const s = currentState ?? state;
      const containerX = screenX - rect.left;
      const containerY = screenY - rect.top;
      const boardX = (containerX - s.panX) / s.zoom;
      const boardY = (containerY - s.panY) / s.zoom;
      return {
        positionX: (boardX / rect.width) * 100,
        positionY: (boardY / rect.height) * 100,
      };
    },
    [containerRef, state]
  );

  const resetZoom = useCallback(() => {
    setState({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  // Register touch listeners on the surface element
  const setSurfaceRef = useCallback(
    (el: HTMLButtonElement | null) => {
      (surfaceRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
      if (!el) return;

      const g = gestureRef.current;

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          g.isPanning = false;
          g.isPinching = true;
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const dx = t1.clientX - t0.clientX;
          const dy = t1.clientY - t0.clientY;
          g.lastPinchDist = Math.hypot(dx, dy);
          g.lastPinchMidX = (t0.clientX + t1.clientX) / 2;
          g.lastPinchMidY = (t0.clientY + t1.clientY) / 2;
          setState((s) => {
            g.pinchStartZoom = s.zoom;
            g.pinchStartPanX = s.panX;
            g.pinchStartPanY = s.panY;
            return s;
          });
        } else if (e.touches.length === 1) {
          const t = e.touches[0];
          const now = Date.now();
          const dx = t.clientX - g.lastTapX;
          const dy = t.clientY - g.lastTapY;

          if (now - g.lastTapTime < DOUBLE_TAP_MS && Math.hypot(dx, dy) < DOUBLE_TAP_PX) {
            // Double-tap: toggle 1x ↔ 2x centered on tap point
            e.preventDefault();
            g.lastTapTime = 0;
            const { w, h } = getContainerSize();
            setState((s) => {
              if (s.zoom > 1.1) {
                return { zoom: 1, panX: 0, panY: 0 };
              }
              const targetZoom = 2;
              const el2 = containerRef.current;
              if (!el2) return { zoom: targetZoom, panX: 0, panY: 0 };
              const rect = el2.getBoundingClientRect();
              const tapX = t.clientX - rect.left;
              const tapY = t.clientY - rect.top;
              const newPanX = -(tapX * (targetZoom - 1));
              const newPanY = -(tapY * (targetZoom - 1));
              return { zoom: targetZoom, ...clampPan(newPanX, newPanY, targetZoom, w, h) };
            });
          } else {
            g.lastTapTime = now;
            g.lastTapX = t.clientX;
            g.lastTapY = t.clientY;
            setState((s) => {
              if (s.zoom <= 1) return s;
              g.isPanning = true;
              g.panStartX = t.clientX;
              g.panStartY = t.clientY;
              g.panStartStateX = s.panX;
              g.panStartStateY = s.panY;
              return s;
            });
          }
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        if (g.isPinching && e.touches.length === 2) {
          e.preventDefault();
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const dx = t1.clientX - t0.clientX;
          const dy = t1.clientY - t0.clientY;
          const dist = Math.hypot(dx, dy);
          const midX = (t0.clientX + t1.clientX) / 2;
          const midY = (t0.clientY + t1.clientY) / 2;
          const scale = dist / g.lastPinchDist;
          g.lastPinchDist = dist;
          g.lastPinchMidX = midX;
          g.lastPinchMidY = midY;
          const { w, h } = getContainerSize();
          setState((s) => {
            const newZoom = clamp(s.zoom * scale, ZOOM_MIN, ZOOM_MAX);
            const el2 = containerRef.current;
            if (!el2) return s;
            const rect = el2.getBoundingClientRect();
            const focusX = midX - rect.left;
            const focusY = midY - rect.top;
            const newPanX = focusX - (focusX - s.panX) * (newZoom / s.zoom);
            const newPanY = focusY - (focusY - s.panY) * (newZoom / s.zoom);
            return { zoom: newZoom, ...clampPan(newPanX, newPanY, newZoom, w, h) };
          });
        } else if (g.isPanning && e.touches.length === 1) {
          e.preventDefault();
          const t = e.touches[0];
          const { w, h } = getContainerSize();
          setState((s) => {
            const newPanX = g.panStartStateX + (t.clientX - g.panStartX);
            const newPanY = g.panStartStateY + (t.clientY - g.panStartY);
            return { zoom: s.zoom, ...clampPan(newPanX, newPanY, s.zoom, w, h) };
          });
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) g.isPinching = false;
        if (e.touches.length === 0) g.isPanning = false;
      };

      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd, { passive: false });

      return () => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
      };
    },
    [containerRef, getContainerSize]
  );

  const innerStyle: React.CSSProperties = {
    transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`,
    transformOrigin: "0 0",
    transition: gestureRef.current.isPinching ? "none" : "transform 0.15s ease-out",
    willChange: "transform",
  };

  return {
    zoom: state.zoom,
    resetZoom,
    innerStyle,
    surfaceRef: setSurfaceRef as unknown as React.RefCallback<HTMLButtonElement>,
    reverseTransform,
  };
}

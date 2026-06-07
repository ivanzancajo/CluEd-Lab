import { useCallback, useEffect, useRef, useState, type RefObject, type CSSProperties } from 'react';

export const ZOOM_MIN = 1.0;
export const ZOOM_MAX = 3.0;
export const ZOOM_DOUBLE_TAP_TARGET = 2.0;
export const ZOOM_LIGHT_CONFIRM = 1.8;

const DOUBLE_TAP_MAX_MS = 280;
const DOUBLE_TAP_MAX_PX = 32;
const PAN_MOVE_THRESHOLD_PX = 4;

type ZoomPanState = {
  zoom: number;
  panX: number;
  panY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampPan(panX: number, panY: number, zoom: number, containerW: number, containerH: number) {
  if (zoom <= 1) return { panX: 0, panY: 0 };
  const maxX = containerW * (zoom - 1);
  const maxY = containerH * (zoom - 1);
  return {
    panX: clamp(panX, -maxX, 0),
    panY: clamp(panY, -maxY, 0),
  };
}

function getPinchDistance(t0: Touch, t1: Touch) {
  return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
}

function getPinchMidpoint(t0: Touch, t1: Touch, containerLeft: number, containerTop: number) {
  return {
    x: (t0.clientX + t1.clientX) / 2 - containerLeft,
    y: (t0.clientY + t1.clientY) / 2 - containerTop,
  };
}

export function useBoardZoomPan(containerRef: RefObject<HTMLDivElement>) {
  const [state, setState] = useState<ZoomPanState>({ zoom: 1, panX: 0, panY: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Refs for gesture tracking (avoid stale closures in native listeners)
  const lastTapTimeRef = useRef(0);
  const lastTapPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartRef = useRef<{
    touches: Array<{ x: number; y: number; id: number }>;
    pinchDist: number | null;
    panStartX: number;
    panStartY: number;
    movedPx: number;
  } | null>(null);
  const isPinchingRef = useRef(false);
  const [isPinching, setIsPinching] = useState(false);

  const surfaceRef = useRef<HTMLButtonElement>(null);

  const resetZoom = useCallback(() => {
    setState({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  const reverseTransform = useCallback(
    (containerX: number, containerY: number) => {
      const { zoom, panX, panY } = stateRef.current;
      const containerW = containerRef.current?.offsetWidth ?? 1;
      const containerH = containerRef.current?.offsetHeight ?? 1;
      const boardX = (containerX - panX) / zoom;
      const boardY = (containerY - panY) / zoom;
      return {
        positionX: (boardX / containerW) * 100,
        positionY: (boardY / containerH) * 100,
      };
    },
    [containerRef]
  );

  // Attach non-passive touch listeners to the surface button
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const container = containerRef.current;
      if (!container) return;

      const touches = Array.from(e.touches);

      if (touches.length === 1) {
        const t = touches[0];
        const now = Date.now();
        const lastTime = lastTapTimeRef.current;
        const lastPos = lastTapPosRef.current;
        const dx = lastPos ? Math.abs(t.clientX - lastPos.x) : Infinity;
        const dy = lastPos ? Math.abs(t.clientY - lastPos.y) : Infinity;

        if (now - lastTime < DOUBLE_TAP_MAX_MS && dx < DOUBLE_TAP_MAX_PX && dy < DOUBLE_TAP_MAX_PX) {
          // Double tap: toggle zoom
          e.preventDefault();
          lastTapTimeRef.current = 0;
          lastTapPosRef.current = null;

          const { zoom: currentZoom, panX: currentPanX, panY: currentPanY } = stateRef.current;
          const rect = container.getBoundingClientRect();
          const cx = t.clientX - rect.left;
          const cy = t.clientY - rect.top;

          if (currentZoom > 1.05) {
            // Zoom out to 1
            setState({ zoom: 1, panX: 0, panY: 0 });
          } else {
            // Zoom in to ZOOM_DOUBLE_TAP_TARGET, centered on tap point
            const targetZoom = ZOOM_DOUBLE_TAP_TARGET;
            const rawPanX = cx * (1 - targetZoom);
            const rawPanY = cy * (1 - targetZoom);
            const clamped = clampPan(rawPanX, rawPanY, targetZoom, rect.width, rect.height);
            setState({ zoom: targetZoom, ...clamped });
          }

          touchStartRef.current = null;
          return;
        }

        lastTapTimeRef.current = now;
        lastTapPosRef.current = { x: t.clientX, y: t.clientY };

        const { panX, panY } = stateRef.current;
        touchStartRef.current = {
          touches: [{ x: t.clientX, y: t.clientY, id: t.identifier }],
          pinchDist: null,
          panStartX: panX,
          panStartY: panY,
          movedPx: 0,
        };
        isPinchingRef.current = false;
      } else if (touches.length === 2) {
        e.preventDefault();
        const dist = getPinchDistance(touches[0], touches[1]);
        const { panX, panY } = stateRef.current;
        touchStartRef.current = {
          touches: touches.map((t) => ({ x: t.clientX, y: t.clientY, id: t.identifier })),
          pinchDist: dist,
          panStartX: panX,
          panStartY: panY,
          movedPx: 0,
        };
        isPinchingRef.current = true;
        setIsPinching(true);
      }
    }

    function onTouchMove(e: TouchEvent) {
      const container = containerRef.current;
      if (!container || !touchStartRef.current) return;

      const touches = Array.from(e.touches);

      if (touches.length === 2 && isPinchingRef.current) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const { zoom: currentZoom, panX: currentPanX, panY: currentPanY } = stateRef.current;
        const startDist = touchStartRef.current.pinchDist;
        if (!startDist) return;

        const newDist = getPinchDistance(touches[0], touches[1]);
        const mid = getPinchMidpoint(touches[0], touches[1], rect.left, rect.top);
        const newZoom = clamp(currentZoom * (newDist / startDist), ZOOM_MIN, ZOOM_MAX);

        // Zoom toward pinch midpoint: the board point under the midpoint should not move
        const rawPanX = mid.x * (1 - newZoom / currentZoom) + currentPanX * (newZoom / currentZoom);
        const rawPanY = mid.y * (1 - newZoom / currentZoom) + currentPanY * (newZoom / currentZoom);
        const clamped = clampPan(rawPanX, rawPanY, newZoom, rect.width, rect.height);

        // Update pinchDist so next move is incremental
        touchStartRef.current.pinchDist = newDist;

        setState({ zoom: newZoom, ...clamped });
        stateRef.current = { zoom: newZoom, ...clamped };
      } else if (touches.length === 1 && !isPinchingRef.current) {
        const { zoom: currentZoom } = stateRef.current;
        if (currentZoom <= 1) return; // No pan at 1×

        const t = touches[0];
        const startTouch = touchStartRef.current.touches[0];
        if (!startTouch) return;

        const dx = t.clientX - startTouch.x;
        const dy = t.clientY - startTouch.y;
        const moved = Math.hypot(dx, dy);

        if (moved > PAN_MOVE_THRESHOLD_PX) {
          e.preventDefault();
          touchStartRef.current.movedPx = moved;
          const rect = container.getBoundingClientRect();
          const rawPanX = touchStartRef.current.panStartX + dx;
          const rawPanY = touchStartRef.current.panStartY + dy;
          const clamped = clampPan(rawPanX, rawPanY, currentZoom, rect.width, rect.height);
          setState((prev) => ({ ...prev, ...clamped }));
          stateRef.current = { ...stateRef.current, ...clamped };
        }
      }
    }

    function onTouchEnd(e: TouchEvent) {
      const remaining = Array.from(e.touches);

      if (remaining.length < 2) {
        isPinchingRef.current = false;
        setIsPinching(false);
      }

      if (remaining.length === 0) {
        // If was a pinch, reset start info
        if (touchStartRef.current?.pinchDist !== null) {
          touchStartRef.current = null;
        }
      }

      // Snap back to zoom=1 if slightly below minimum
      const { zoom } = stateRef.current;
      if (zoom < ZOOM_MIN + 0.05) {
        setState({ zoom: 1, panX: 0, panY: 0 });
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [containerRef]);

  const innerStyle: CSSProperties = {
    transformOrigin: '0 0',
    transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`,
    willChange: 'transform',
    transition: isPinching ? 'none' : 'transform 0.15s ease-out',
  };

  return {
    zoom: state.zoom,
    resetZoom,
    innerStyle,
    surfaceRef,
    reverseTransform,
    ZOOM_LIGHT_CONFIRM,
  };
}

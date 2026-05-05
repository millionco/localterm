import type { Terminal as XtermTerminal } from "@xterm/xterm";
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  TERMINAL_SCROLLBAR_FADE_IN_MS,
  TERMINAL_SCROLLBAR_FADE_OUT_MS,
  TERMINAL_SCROLLBAR_HIDE_DELAY_MS,
  TERMINAL_SCROLLBAR_HOVER_ZONE_PX,
  TERMINAL_SCROLLBAR_SCROLL_LINGER_MS,
  TERMINAL_SCROLLBAR_THUMB_MIN_HEIGHT_PX,
  TERMINAL_SCROLLBAR_TRACK_EDGE_GUTTER_PX,
  TERMINAL_SCROLLBAR_TRACK_INSET_PX,
  TERMINAL_SCROLLBAR_TRACK_WIDTH_PX,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { computeScrollbarDragTarget } from "@/utils/compute-scrollbar-drag-target";
import { computeScrollbarThumbGeometry } from "@/utils/compute-scrollbar-thumb-geometry";

interface TerminalScrollbarProps {
  terminal: XtermTerminal | null;
  hostRef: RefObject<HTMLDivElement | null>;
}

interface TerminalScrollState {
  viewportY: number;
  baseY: number;
  rows: number;
}

const readScrollState = (terminal: XtermTerminal): TerminalScrollState => ({
  viewportY: terminal.buffer.active.viewportY,
  baseY: terminal.buffer.active.baseY,
  rows: terminal.rows,
});

const EMPTY_SCROLL_STATE: TerminalScrollState = { viewportY: 0, baseY: 0, rows: 0 };

export const TerminalScrollbar = ({ terminal, hostRef }: TerminalScrollbarProps) => {
  const hideTimerRef = useRef<number | null>(null);
  const scrollLingerTimerRef = useRef<number | null>(null);
  const refreshFrameRef = useRef<number | null>(null);
  const dragOriginRef = useRef<{ pointerY: number; viewportY: number } | null>(null);
  const trackElementRef = useRef<HTMLDivElement | null>(null);
  const lastDistanceFromBottomRef = useRef<number>(0);
  const trackObserverRef = useRef<ResizeObserver | null>(null);

  const [scrollState, setScrollState] = useState<TerminalScrollState>(EMPTY_SCROLL_STATE);
  const [trackHeightPx, setTrackHeightPx] = useState(0);
  const [isHoveringRightEdge, setIsHoveringRightEdge] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecentlyScrolled, setIsRecentlyScrolled] = useState(false);

  // The track is conditionally rendered (only once baseY > 0), so a useLayoutEffect
  // with [] deps would miss it appearing later. A ref callback wires up the
  // ResizeObserver exactly when the track mounts and tears it down on unmount.
  const attachTrackElement = useCallback((trackElement: HTMLDivElement | null) => {
    trackElementRef.current = trackElement;
    if (trackObserverRef.current) {
      trackObserverRef.current.disconnect();
      trackObserverRef.current = null;
    }
    if (!trackElement) {
      setTrackHeightPx(0);
      return;
    }
    setTrackHeightPx(trackElement.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setTrackHeightPx(entry.contentRect.height);
    });
    observer.observe(trackElement);
    trackObserverRef.current = observer;
  }, []);

  useEffect(() => {
    if (!terminal) {
      setScrollState(EMPTY_SCROLL_STATE);
      return;
    }
    setScrollState(readScrollState(terminal));
    const scheduleRefresh = () => {
      if (refreshFrameRef.current !== null) return;
      refreshFrameRef.current = window.requestAnimationFrame(() => {
        refreshFrameRef.current = null;
        setScrollState(readScrollState(terminal));
      });
    };
    const subscriptions = [
      terminal.onScroll(scheduleRefresh),
      terminal.onResize(scheduleRefresh),
      terminal.onWriteParsed(scheduleRefresh),
    ];
    // xterm.js's wheel/drag-driven scrolls call scrollLines with
    // suppressScrollEvent=true (so its own viewport doesn't recurse), which
    // also silences the public onScroll. The internal `.xterm-viewport`
    // element's scrollTop is the source of truth xterm itself reads, so we
    // mirror its scroll DOM event to catch those otherwise-invisible updates.
    const host = hostRef.current;
    const xtermViewport = host?.querySelector(".xterm-viewport");
    xtermViewport?.addEventListener("scroll", scheduleRefresh, { passive: true });
    return () => {
      if (refreshFrameRef.current !== null) {
        window.cancelAnimationFrame(refreshFrameRef.current);
        refreshFrameRef.current = null;
      }
      for (const subscription of subscriptions) subscription.dispose();
      xtermViewport?.removeEventListener("scroll", scheduleRefresh);
    };
  }, [terminal, hostRef]);

  // Distance from the bottom of the buffer. Stays at 0 while pinned to the bottom
  // (auto-scroll on streaming output keeps viewportY === baseY in lockstep), and
  // grows the moment the user wheels/drags/keys away from the bottom — so changes
  // here always represent real user-initiated scroll, not output noise.
  const distanceFromBottom = scrollState.baseY - scrollState.viewportY;

  useEffect(() => {
    if (distanceFromBottom === lastDistanceFromBottomRef.current) return;
    lastDistanceFromBottomRef.current = distanceFromBottom;
    setIsRecentlyScrolled(true);
    if (scrollLingerTimerRef.current !== null) {
      window.clearTimeout(scrollLingerTimerRef.current);
    }
    scrollLingerTimerRef.current = window.setTimeout(() => {
      scrollLingerTimerRef.current = null;
      setIsRecentlyScrolled(false);
    }, TERMINAL_SCROLLBAR_SCROLL_LINGER_MS);
  }, [distanceFromBottom]);

  useEffect(() => {
    return () => {
      if (scrollLingerTimerRef.current !== null) {
        window.clearTimeout(scrollLingerTimerRef.current);
        scrollLingerTimerRef.current = null;
      }
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const cancelHide = () => {
      if (hideTimerRef.current === null) return;
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    };
    const scheduleHide = () => {
      cancelHide();
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        if (dragOriginRef.current === null) setIsHoveringRightEdge(false);
      }, TERMINAL_SCROLLBAR_HIDE_DELAY_MS);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const distanceFromRight = rect.right - event.clientX;
      const isInsideZone =
        distanceFromRight >= 0 && distanceFromRight <= TERMINAL_SCROLLBAR_HOVER_ZONE_PX;
      if (isInsideZone) {
        cancelHide();
        setIsHoveringRightEdge(true);
        return;
      }
      scheduleHide();
    };
    const handlePointerLeave = () => {
      if (dragOriginRef.current === null) scheduleHide();
    };
    host.addEventListener("pointermove", handlePointerMove);
    host.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      cancelHide();
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [hostRef]);

  const isScrollable = scrollState.baseY > 0 && scrollState.rows > 0;
  const { thumbTopPx, thumbHeightPx } = computeScrollbarThumbGeometry({
    trackHeightPx,
    viewportY: scrollState.viewportY,
    baseY: scrollState.baseY,
    rows: scrollState.rows,
    minThumbHeightPx: TERMINAL_SCROLLBAR_THUMB_MIN_HEIGHT_PX,
  });

  const handleTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!terminal || !isScrollable) return;
      if (event.button !== 0) return;
      event.preventDefault();
      const trackElement = trackElementRef.current;
      if (!trackElement) return;

      try {
        trackElement.setPointerCapture(event.pointerId);
      } catch {
        /* pointer capture is unsupported in jsdom and a few exotic browsers; drag still works without it */
      }

      const trackRect = trackElement.getBoundingClientRect();
      const clickOffsetPx = event.clientY - trackRect.top;
      const isOnThumb = clickOffsetPx >= thumbTopPx && clickOffsetPx <= thumbTopPx + thumbHeightPx;

      if (isOnThumb) {
        dragOriginRef.current = {
          pointerY: event.clientY,
          viewportY: terminal.buffer.active.viewportY,
        };
      } else {
        const currentBaseY = terminal.buffer.active.baseY;
        const usableTrackPx = Math.max(trackHeightPx - thumbHeightPx, 1);
        const scrollProgress = Math.max(0, Math.min(1, (clickOffsetPx - thumbHeightPx / 2) / usableTrackPx));
        const targetViewportY = Math.max(0, Math.min(currentBaseY, Math.round(scrollProgress * currentBaseY)));
        const currentViewportY = terminal.buffer.active.viewportY;
        const lineDelta = targetViewportY - currentViewportY;
        if (lineDelta !== 0) terminal.scrollLines(lineDelta);
        dragOriginRef.current = {
          pointerY: event.clientY,
          viewportY: targetViewportY,
        };
      }
      setIsDragging(true);
    },
    [isScrollable, terminal, thumbTopPx, thumbHeightPx, trackHeightPx],
  );

  const handleTrackPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragOrigin = dragOriginRef.current;
      if (!dragOrigin || !terminal) return;
      const currentBaseY = terminal.buffer.active.baseY;
      const targetViewportY = computeScrollbarDragTarget({
        pointerDeltaPx: event.clientY - dragOrigin.pointerY,
        startViewportY: dragOrigin.viewportY,
        trackHeightPx,
        thumbHeightPx,
        baseY: currentBaseY,
      });
      const currentViewportY = terminal.buffer.active.viewportY;
      const lineDelta = targetViewportY - currentViewportY;
      if (lineDelta !== 0) terminal.scrollLines(lineDelta);
    },
    [terminal, thumbHeightPx, trackHeightPx],
  );

  const handleTrackPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const trackElement = trackElementRef.current;
    try {
      if (trackElement?.hasPointerCapture(event.pointerId)) {
        trackElement.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* see handleTrackPointerDown */
    }
    dragOriginRef.current = null;
    setIsDragging(false);
  }, []);

  if (!isScrollable) return null;

  const isVisible = isHoveringRightEdge || isDragging || isRecentlyScrolled;

  return (
    <div
      ref={attachTrackElement}
      aria-hidden="true"
      className={cn(
        "absolute z-10 touch-none",
        isVisible ? "pointer-events-auto" : "pointer-events-none",
        isDragging && "cursor-grabbing",
      )}
      style={{
        top: `${TERMINAL_SCROLLBAR_TRACK_EDGE_GUTTER_PX}px`,
        bottom: `${TERMINAL_SCROLLBAR_TRACK_EDGE_GUTTER_PX}px`,
        right: `${TERMINAL_SCROLLBAR_TRACK_INSET_PX}px`,
        width: `${TERMINAL_SCROLLBAR_TRACK_WIDTH_PX}px`,
        opacity: isVisible ? 1 : 0,
        transition: `opacity ${isVisible ? TERMINAL_SCROLLBAR_FADE_IN_MS : TERMINAL_SCROLLBAR_FADE_OUT_MS
          }ms cubic-bezier(0.32, 0.72, 0, 1)`,
      }}
      onPointerDown={handleTrackPointerDown}
      onPointerMove={handleTrackPointerMove}
      onPointerUp={handleTrackPointerUp}
      onPointerCancel={handleTrackPointerUp}
    >
      <div
        role="scrollbar"
        aria-orientation="vertical"
        aria-label="terminal scrollback"
        aria-valuemin={0}
        aria-valuemax={scrollState.baseY}
        aria-valuenow={scrollState.viewportY}
        tabIndex={-1}
        className={cn(
          "absolute right-0 left-0 cursor-grab rounded-full bg-foreground/55 transition-colors duration-100 hover:bg-foreground/75",
          isDragging && "cursor-grabbing bg-foreground/85",
        )}
        style={{
          top: `${thumbTopPx}px`,
          height: `${thumbHeightPx}px`,
        }}
      />
    </div>
  );
};

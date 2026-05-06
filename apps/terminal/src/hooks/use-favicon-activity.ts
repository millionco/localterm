import { useCallback, useRef } from "react";
import { FAVICON_ACTIVE_DEBOUNCE_MS, FAVICON_IDLE_DEBOUNCE_MS } from "@/lib/constants";
import { setTabFaviconState } from "@/utils/set-tab-favicon-state";

export interface UseFaviconActivityReturn {
  noteOutputActivity: () => void;
  resetFavicon: () => void;
  markFaviconDead: () => void;
}

export const useFaviconActivity = (
  exitedRef: React.RefObject<boolean>,
): UseFaviconActivityReturn => {
  const faviconStateRef = useRef<"idle" | "active">("idle");
  const faviconActiveTimerRef = useRef<number | null>(null);
  const faviconIdleTimerRef = useRef<number | null>(null);

  const noteOutputActivity = useCallback(() => {
    if (faviconIdleTimerRef.current !== null) {
      window.clearTimeout(faviconIdleTimerRef.current);
      faviconIdleTimerRef.current = null;
    }
    if (faviconStateRef.current === "idle" && faviconActiveTimerRef.current === null) {
      faviconActiveTimerRef.current = window.setTimeout(() => {
        faviconActiveTimerRef.current = null;
        if (exitedRef.current) return;
        faviconStateRef.current = "active";
        setTabFaviconState("active");
      }, FAVICON_ACTIVE_DEBOUNCE_MS);
    }
    faviconIdleTimerRef.current = window.setTimeout(() => {
      faviconIdleTimerRef.current = null;
      if (faviconActiveTimerRef.current !== null) {
        window.clearTimeout(faviconActiveTimerRef.current);
        faviconActiveTimerRef.current = null;
      }
      if (faviconStateRef.current === "active") {
        faviconStateRef.current = "idle";
        setTabFaviconState("idle");
      }
    }, FAVICON_IDLE_DEBOUNCE_MS);
  }, [exitedRef]);

  const resetFavicon = useCallback(() => {
    if (faviconActiveTimerRef.current !== null) {
      window.clearTimeout(faviconActiveTimerRef.current);
      faviconActiveTimerRef.current = null;
    }
    if (faviconIdleTimerRef.current !== null) {
      window.clearTimeout(faviconIdleTimerRef.current);
      faviconIdleTimerRef.current = null;
    }
    if (faviconStateRef.current === "active") {
      faviconStateRef.current = "idle";
      setTabFaviconState("idle");
    }
  }, []);

  const markFaviconDead = useCallback(() => {
    resetFavicon();
    setTabFaviconState("dead");
  }, [resetFavicon]);

  return { noteOutputActivity, resetFavicon, markFaviconDead };
};

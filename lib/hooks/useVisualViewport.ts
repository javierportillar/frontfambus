"use client";

import { useEffect, useState } from "react";

export interface VisualViewportBounds {
  height: number;
  offsetTop: number;
}

/** Track the actually visible viewport so chat can stay above mobile keyboards. */
export function useVisualViewport(): VisualViewportBounds {
  const [bounds, setBounds] = useState<VisualViewportBounds>({ height: 0, offsetTop: 0 });

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = (): void => {
      const next = {
        height: Math.round(viewport?.height ?? window.innerHeight),
        offsetTop: Math.max(0, Math.round(viewport?.offsetTop ?? 0)),
      };
      setBounds((current) => (
        current.height === next.height && current.offsetTop === next.offsetTop ? current : next
      ));
    };

    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return bounds;
}

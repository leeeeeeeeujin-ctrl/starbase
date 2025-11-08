import { useEffect } from "react";

// Wires basic keyboard and pointer inputs to adapter.onInput
export default function useGameInput(adapterRef, containerRef) {
  useEffect(() => {
    const adapter = adapterRef.current;
    const el = containerRef?.current || window;
    if (!adapter || !el) return;

    const onKey = (e) => {
      try { adapter.onInput?.({ type: e.type, key: e.key, code: e.code, repeat: e.repeat }); } catch {}
    };
    const onPointer = (e) => {
      const rect = (containerRef?.current || e.target).getBoundingClientRect?.() || { left: 0, top: 0 };
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      try { adapter.onInput?.({ type: e.type, x, y, button: e.button, pointerId: e.pointerId }); } catch {}
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    el.addEventListener("pointerdown", onPointer);
    el.addEventListener("pointermove", onPointer);
    el.addEventListener("pointerup", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      el.removeEventListener("pointerdown", onPointer);
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerup", onPointer);
    };
  }, [adapterRef, containerRef]);
}


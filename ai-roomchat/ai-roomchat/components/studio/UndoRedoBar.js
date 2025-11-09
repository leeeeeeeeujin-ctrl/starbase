import { useEffect, useRef, useState } from 'react';
import { useTemplate } from '../../contexts/TemplateStore';

export default function UndoRedoBar({ limit = 50 }) {
  const { templateText, setTemplateText } = useTemplate();
  const historyRef = useRef([templateText || '']);
  const indexRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Track incoming external changes: push once when templateText diverges from current index
  useEffect(() => {
    const arr = historyRef.current;
    const idx = indexRef.current;
    const current = arr[idx];
    const incoming = templateText || '';
    if (incoming !== current) {
      const next = arr.slice(0, idx + 1).concat(incoming).slice(-limit);
      historyRef.current = next;
      indexRef.current = next.length - 1;
      setCanUndo(indexRef.current > 0);
      setCanRedo(false);
    }
  }, [templateText, limit]);

  const undo = () => {
    const arr = historyRef.current;
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    setTemplateText(arr[indexRef.current]);
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < arr.length - 1);
  };
  const redo = () => {
    const arr = historyRef.current;
    if (indexRef.current >= arr.length - 1) return;
    indexRef.current += 1;
    setTemplateText(arr[indexRef.current]);
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < arr.length - 1);
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
    </div>
  );
}


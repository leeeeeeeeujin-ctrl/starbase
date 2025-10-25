'use client';

import { useEffect } from 'react';

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

function isSaveHotkey(event) {
  if (event.key !== 's') return false;
  return isMac() ? event.metaKey : event.ctrlKey;
}

export function useMakerEditorShortcuts({
  selectedNodeId,
  selectedEdge,
  onDeleteNode,
  onDeleteEdge,
  saveAll,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (isSaveHotkey(event)) {
        event.preventDefault();
        saveAll();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const target = event.target;
        const tagName = target?.tagName?.toLowerCase?.() ?? '';
        const isEditableElement =
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          target?.isContentEditable ||
          target?.getAttribute?.('role') === 'textbox';

        if (isEditableElement) {
          return;
        }

        if (selectedNodeId) {
          onDeleteNode(selectedNodeId);
        } else if (selectedEdge) {
          onDeleteEdge(selectedEdge);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedEdge, onDeleteNode, onDeleteEdge, saveAll]);
}

//

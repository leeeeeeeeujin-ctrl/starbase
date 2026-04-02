"use client";

import React, { useEffect, useState } from 'react';
import CapabilitiesHelpPanel from './CapabilitiesHelpPanel.jsx';

export default function CapabilitiesMount() {
  const [open, setOpen] = useState(false);
  const [isMakerRoute, setIsMakerRoute] = useState(false);

  useEffect(() => {
    try {
      const pathname = String(window.location.pathname || '');
      setIsMakerRoute(pathname.startsWith('/maker/'));
    } catch {
      setIsMakerRoute(false);
    }
  }, []);

  useEffect(() => {
    if (isMakerRoute) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('caps') === '1') setOpen(true);
    } catch {}
  }, [isMakerRoute]);

  useEffect(() => {
    if (isMakerRoute) return;
    const onKey = (e) => {
      try {
        const active = document.activeElement;
        const tag = String(active?.tagName || '').toUpperCase();
        const isEditable = Boolean(
          active?.isContentEditable ||
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT'
        );
        if (isEditable) return;
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
          setOpen((v) => !v);
        }
      } catch {}
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMakerRoute]);

  useEffect(() => {
    if (isMakerRoute) return;
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener('capabilities:open', onOpen);
    window.addEventListener('capabilities:close', onClose);
    return () => {
      window.removeEventListener('capabilities:open', onOpen);
      window.removeEventListener('capabilities:close', onClose);
    };
  }, [isMakerRoute]);

  if (isMakerRoute || !open) return null;
  return <CapabilitiesHelpPanel onClose={() => setOpen(false)} />;
}

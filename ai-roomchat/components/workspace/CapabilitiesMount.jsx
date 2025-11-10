"use client";

import React, { useEffect, useState } from 'react';
import CapabilitiesHelpPanel from './CapabilitiesHelpPanel.jsx';

export default function CapabilitiesMount() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('caps') === '1') setOpen(true);
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      try {
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
          setOpen((v) => !v);
        }
      } catch {}
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener('capabilities:open', onOpen);
    window.addEventListener('capabilities:close', onClose);
    return () => {
      window.removeEventListener('capabilities:open', onOpen);
      window.removeEventListener('capabilities:close', onClose);
    };
  }, []);

  if (!open) return null;
  return <CapabilitiesHelpPanel onClose={() => setOpen(false)} />;
}


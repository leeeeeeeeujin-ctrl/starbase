import React, { useEffect, useState } from 'react';

export default function ExtensionsHost() {
  const [open, setOpen] = useState(false);
  const [Modal, setModal] = useState(null);

  useEffect(() => {
    try {
      if (typeof globalThis !== 'undefined') {
        if (typeof globalThis.__EXT_OPEN__ === 'undefined') globalThis.__EXT_OPEN__ = false;
        if (typeof globalThis.extensionsOpen === 'undefined') globalThis.extensionsOpen = globalThis.__EXT_OPEN__;
      }
    } catch {}
  }, []);

  useEffect(() => {
    function handleOpen() { setOpen(true); }
    window.addEventListener('ai:open-extensions', handleOpen);
    window.starbaseOpenExtensions = handleOpen;
    return () => {
      window.removeEventListener('ai:open-extensions', handleOpen);
      try { delete window.starbaseOpenExtensions; } catch {}
    };
  }, []);

  useEffect(() => {
    if (!open || Modal) return;
    import('./ExtensionInstallModal')
      .then((m) => setModal(() => m.default))
      .catch(() => {});
  }, [open, Modal]);

  useEffect(() => {
    const inject = (menuEl) => {
      if (!menuEl || menuEl.__extItemAdded) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '확장 프로그램…';
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 10px;background:transparent;color:#ddd;border:none;cursor:pointer;';
      btn.addEventListener('click', () => setOpen(true));
      try { menuEl.insertBefore(btn, menuEl.firstChild); } catch {}
      menuEl.__extItemAdded = true;
    };
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.getAttribute && (n.getAttribute('role') === 'menu' || n.matches('[data-ai-dock-menu], .dock-menu, .dropdown-menu'))) {
            inject(n);
          } else {
            const cand = n.querySelector && n.querySelector('[role="menu"], [data-ai-dock-menu], .dock-menu, .dropdown-menu');
            if (cand) inject(cand);
          }
        });
      }
    });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch {}
    return () => { try { obs.disconnect(); } catch {} };
  }, []);

  if (!open) return null;
  const ExtensionInstallModal = Modal;
  if (!ExtensionInstallModal) return null;
  return <ExtensionInstallModal open={open} onClose={() => setOpen(false)} />;
}


// Side-effect module to inject Extensions menu item and host modal

if (typeof window !== 'undefined') {
  if (!window.__extHostInit) {
    window.__extHostInit = true;

    window.__openExtensionsModal = () => {
      const id = 'ext-modal-root';
      let mount = document.getElementById(id);
      if (!mount) {
        mount = document.createElement('div');
        mount.id = id;
        document.body.appendChild(mount);
      }
      Promise.all([
        import('react'),
        import('react-dom/client'),
        import('./ExtensionInstallModal'),
      ])
        .then(([React, ReactDOM, mod]) => {
          const Modal = mod.default;
          const root = mount.__root || (mount.__root = ReactDOM.createRoot(mount));
          function Host() {
            const [open, setOpen] = React.useState(true);
            return React.createElement(Modal, { open, onClose: () => setOpen(false) });
          }
          root.render(React.createElement(Host));
        })
        .catch(() => {});
    };

    // Keyboard shortcut: Ctrl/Cmd+Shift+E
    window.addEventListener('keydown', (e) => {
      const key = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'e') {
        e.preventDefault();
        window.__openExtensionsModal();
      }
    });

    // Resize handle detection to help debounce
    const markResize = (on) => (window.__aiDockIsResizing = !!on);
    window.addEventListener(
      'pointerdown',
      (ev) => {
        const el = ev.target;
        if (el && el.getAttribute && el.getAttribute('title') === '크기 조절') markResize(true);
      },
      true
    );
    window.addEventListener('pointerup', () => markResize(false), true);
    window.addEventListener('pointercancel', () => markResize(false), true);

    // Inject menu item into any popup menu dynamically
    const injectInto = (menuEl) => {
      if (!menuEl || menuEl.__extInjected) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '확장 프로그램…';
      btn.style.cssText =
        'display:block;width:100%;text-align:left;padding:8px 10px;background:transparent;color:#ddd;border:none;cursor:pointer;';
      btn.addEventListener('click', () => {
        window.__openExtensionsModal();
      });
      try {
        menuEl.insertBefore(btn, menuEl.firstChild);
      } catch {}
      menuEl.__extInjected = true;
    };

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (
            n.getAttribute &&
            (n.getAttribute('role') === 'menu' || n.matches('[data-ai-dock-menu], .dock-menu, .dropdown-menu'))
          ) {
            injectInto(n);
          } else {
            const cand =
              n.querySelector && n.querySelector('[role="menu"], [data-ai-dock-menu], .dock-menu, .dropdown-menu');
            if (cand) injectInto(cand);
          }
        });
      }
    });
    try {
      obs.observe(document.body, { childList: true, subtree: true });
    } catch {}
  }
}


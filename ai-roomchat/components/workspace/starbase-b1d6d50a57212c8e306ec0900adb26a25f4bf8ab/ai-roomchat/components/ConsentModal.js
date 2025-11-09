import { useState } from 'react';

export default function ConsentModal({ open, onConfirm, onCancel, title = 'Run prompt on this device' }) {
  const [checked, setChecked] = useState(false);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div style={{ background: 'white', padding: 20, borderRadius: 8, width: 520 }}>
        <h3>{title}</h3>
        <p>
          This action will execute a prompt using your local runner. The runner may access local files or
          network depending on the template's capabilities. By continuing you explicitly consent to
          this execution and agree that a record of this run (metadata only) will be logged for audit.
        </p>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            I understand and consent to run this prompt on this device.
          </label>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => { setChecked(false); onCancel && onCancel(); }} style={{ padding: '8px 12px' }}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (!checked) return;
              onConfirm && onConfirm();
              setChecked(false);
            }}
            disabled={!checked}
            style={{ padding: '8px 12px', background: '#0b5fff', color: 'white', border: 'none' }}
          >
            Run on this device
          </button>
        </div>
      </div>
    </div>
  );
}

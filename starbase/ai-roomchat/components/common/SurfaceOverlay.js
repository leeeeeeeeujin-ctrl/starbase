'use client';

import React from 'react';

export default function SurfaceOverlay({
  open,
  title,
  onClose,
  width = 420,
  children,
  contentStyle,
  hideHeader = false,
  frameStyle,
  zIndex = 1500,
  containerStyle = {},
  verticalAlign = 'center',
  viewportHeight = null,
}) {
  const handleBackdropClick = event => {
    if (!open || !onClose) return;
    event.preventDefault();
    onClose(event);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        minHeight: viewportHeight || '100vh',
        height: viewportHeight || '100dvh',
        zIndex,
        display: 'flex',
        alignItems: verticalAlign,
        justifyContent: 'center',
        pointerEvents: open ? 'auto' : 'none',
        transition: 'pointer-events 0s linear 150ms',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: open ? 'rgba(2, 6, 23, 0.6)' : 'rgba(2, 6, 23, 0)',
          transition: 'background 150ms ease',
        }}
        aria-hidden
        onClick={handleBackdropClick}
        onMouseDown={event => {
          // prevent focus from jumping when clicking on the backdrop
          event.preventDefault();
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: width,
          transform: open ? 'translateY(0)' : 'translateY(20px)',
          opacity: open ? 1 : 0,
          transition: 'opacity 180ms ease, transform 180ms ease',
          pointerEvents: open ? 'auto' : 'none',
          ...containerStyle,
        }}
      >
        <div
          style={{
            borderRadius: 26,
            overflow: 'hidden',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.92)',
            boxShadow: '0 60px 150px -60px rgba(15, 23, 42, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            maxHeight: '94vh',
            ...frameStyle,
          }}
        >
          {hideHeader ? null : (
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 22px',
                borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
                color: '#e2e8f0',
                background: 'rgba(15, 23, 42, 0.9)',
              }}
            >
              <strong style={{ fontSize: 15 }}>{title}</strong>
              <button
                type="button"
                onClick={onClose}
                style={{
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  borderRadius: 999,
                  padding: '6px 12px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  color: '#cbd5f5',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </header>
          )}
          <div
            style={{
              padding: hideHeader ? 0 : 22,
              overflowY: 'auto',
              background: 'rgba(15, 23, 42, 0.75)',
              ...contentStyle,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

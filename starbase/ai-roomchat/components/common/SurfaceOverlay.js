'use client'

import React from 'react'

const PLACEMENTS = {
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0px',
    transformClosed: 'translateY(20px)',
    zIndex: 1500,
    panel: {
      background: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(148, 163, 184, 0.35)',
      boxShadow: '0 50px 120px -50px rgba(15, 23, 42, 0.9)',
      headerBackground: 'rgba(15, 23, 42, 0.9)',
      headerColor: '#e2e8f0',
      closeButton: {
        border: '1px solid rgba(148, 163, 184, 0.45)',
        background: 'rgba(15, 23, 42, 0.6)',
        color: '#cbd5f5',
      },
      contentBackground: 'rgba(15, 23, 42, 0.75)',
      maxHeight: '80vh',
    },
  },
  'bottom-right': {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '20px 24px',
    transformClosed: 'translateY(16px)',
    zIndex: 1800,
    panel: {
      background: '#f8fafc',
      borderColor: 'rgba(148, 163, 184, 0.3)',
      boxShadow: '0 28px 70px -40px rgba(15, 23, 42, 0.45)',
      headerBackground: '#e2e8f0',
      headerColor: '#0f172a',
      closeButton: {
        border: '1px solid rgba(148, 163, 184, 0.45)',
        background: '#fff',
        color: '#1f2937',
      },
      contentBackground: '#fff',
      maxHeight: '70vh',
    },
  },
}

export default function SurfaceOverlay({
  open,
  title,
  onClose,
  width = 420,
  children,
  contentStyle,
  placement = 'center',
  withBackdrop = true,
}) {
  const config = PLACEMENTS[placement] || PLACEMENTS.center
  const { panel } = config

  const pointerEvents = open
    ? withBackdrop || placement === 'center'
      ? 'auto'
      : 'none'
    : 'none'
  const visibilityDelay = open ? '0ms' : '200ms'

  return (
    <div
      aria-hidden={!open}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: config.zIndex,
        display: 'flex',
        alignItems: config.alignItems,
        justifyContent: config.justifyContent,
        padding: config.padding,
        pointerEvents,
        transition: `pointer-events 0s linear 150ms, visibility 0s linear ${visibilityDelay}`,
        visibility: open ? 'visible' : 'hidden',
      }}
    >
      {withBackdrop ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: open ? 'rgba(2, 6, 23, 0.6)' : 'rgba(2, 6, 23, 0)',
            transition: 'background 150ms ease',
          }}
          aria-hidden
        />
      ) : null}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: width,
          transform: open ? 'translateY(0)' : config.transformClosed,
          opacity: open ? 1 : 0,
          transition: 'opacity 180ms ease, transform 180ms ease',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            borderRadius: 24,
            overflow: 'hidden',
            border: `1px solid ${panel.borderColor}`,
            background: panel.background,
            boxShadow: panel.boxShadow,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            maxHeight: panel.maxHeight,
          }}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
              color: panel.headerColor,
              background: panel.headerBackground,
            }}
          >
            <strong style={{ fontSize: 15 }}>{title}</strong>
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                ...panel.closeButton,
              }}
            >
              닫기
            </button>
          </header>
          <div
            style={{
              padding: 16,
              overflowY: 'auto',
              background: panel.contentBackground,
              ...contentStyle,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

import React from 'react'

export default function BackgroundLayer({ backgroundUrl }) {
  if (!backgroundUrl) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: `url(${backgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(28px)',
        opacity: 0.5,
        zIndex: 0,
      }}
    />
  )
}

//

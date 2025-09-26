"use client"

import React, { useEffect, useRef, useState } from 'react'

import { useAuth } from '../features/auth'

function getInitials(name) {
  if (!name) return '유'
  const trimmed = name.trim()
  if (!trimmed) return '유'
  const firstChar = Array.from(trimmed)[0]
  return firstChar ? firstChar.toUpperCase() : '유'
}

export default function LogoutButton({ onAfter, avatarUrl, displayName }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const { signOut } = useAuth()

  useEffect(() => {
    function handleClickOutside(event) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  async function handleSignOut() {
    try {
      await signOut()
      setOpen(false)
      if (onAfter) onAfter()
    } catch (error) {
      console.error('로그아웃에 실패했습니다:', error)
      alert(error?.message || '로그아웃에 실패했습니다.')
    }
  }

  const initials = getInitials(displayName)

  return (
    <div
      ref={menuRef}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: 42,
          height: 42,
          borderRadius: '50%',
          border: '1px solid rgba(148, 163, 184, 0.45)',
          background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.35) 0%, rgba(30, 41, 59, 0.9) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 14px 35px -24px rgba(15, 23, 42, 0.95)',
          overflow: 'hidden',
          color: '#e2e8f0',
          fontWeight: 700,
          letterSpacing: 0.4,
        }}
        aria-label="프로필 메뉴"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="프로필"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span>{initials}</span>
        )}
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            minWidth: 140,
            borderRadius: 14,
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(15, 23, 42, 0.95)',
            boxShadow: '0 28px 60px -40px rgba(2, 6, 23, 0.95)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            color: '#e2e8f0',
            zIndex: 1200,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>로그인 계정</span>
            <strong style={{ fontSize: 14, color: '#e2e8f0' }}>{displayName || '사용자'}</strong>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, rgba(248, 113, 113, 0.18) 0%, rgba(239, 68, 68, 0.35) 100%)',
              color: '#fee2e2',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  )
}

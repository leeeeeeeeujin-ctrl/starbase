'use client'

import Link from 'next/link'
import React, { forwardRef, useEffect, useImperativeHandle } from 'react'

import SurfaceOverlay from '../common/SurfaceOverlay'

const ChatOverlay = forwardRef(function ChatOverlay(
  {
    open,
    onClose,
  },
  ref,
) {
  useImperativeHandle(
    ref,
    () => ({
      openThread: () => {},
      resetThread: () => {},
    }),
    [],
  )

  useEffect(() => {
    if (!open) {
      return
    }
  }, [open])

  return (
    <SurfaceOverlay open={open} onClose={onClose} title="공용 채팅 안내" width={420}>
      <div style={{ display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#94a3b8' }}>
          공용 채팅은 이제 별도의 페이지에서 제공합니다. 아래 버튼을 눌러 새 창에서 글로벌 채팅을 이용해 주세요.
        </p>
        <Link
          href="/chat"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 999,
            background: 'rgba(56, 189, 248, 0.18)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#bae6fd',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          공용 채팅 열기
        </Link>
      </div>
    </SurfaceOverlay>
  )
})

export default ChatOverlay

import React from 'react'
import { supabase } from '../lib/supabase'

export default function AuthButton({ variant = 'default', label = 'Google 로그인' }) {
  async function signIn() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth-callback`, // auth-callback.js랑 일치
        },
      })
      if (error) {
        console.error(error)
        alert('로그인 실패: ' + error.message)
      }
    } catch (e) {
      console.error(e)
      alert('로그인 중 오류')
    }
  }

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error(error)
        alert('로그아웃 실패: ' + error.message)
      }
    } catch (e) {
      console.error(e)
      alert('로그아웃 중 오류')
    }
  }

  if (variant === 'landing') {
    return (
      <>
        <button className="landingButton" onClick={signIn}>
          <span aria-hidden className="landingGlyph">G</span>
          {label}
        </button>
        <style jsx>{`
          .landingButton {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            border-radius: 9999px;
            padding: 0.625rem 1.75rem;
            font-size: 0.875rem;
            font-weight: 600;
            letter-spacing: 0.04em;
            background: rgba(15, 15, 15, 0.92);
            color: #f5f5f5;
            border: 1px solid rgba(255, 255, 255, 0.24);
            box-shadow: 0 18px 35px rgba(0, 0, 0, 0.45);
            transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
          }
          .landingButton:hover {
            transform: translateY(-2px);
            background: rgba(25, 25, 25, 0.92);
            box-shadow: 0 22px 45px rgba(0, 0, 0, 0.55);
          }
          .landingButton:active {
            transform: translateY(0);
            box-shadow: 0 14px 24px rgba(0, 0, 0, 0.4);
          }
          .landingButton:focus-visible {
            outline: 2px solid rgba(148, 197, 255, 0.9);
            outline-offset: 3px;
          }
          .landingGlyph {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 1.75rem;
            height: 1.75rem;
            border-radius: 9999px;
            background: #202020;
            color: #fff;
            font-weight: 700;
            font-size: 0.95rem;
            letter-spacing: 0;
            box-shadow: inset 0 0 12px rgba(255, 255, 255, 0.08);
          }
        `}</style>
      </>
    )
  }

  return (
    <>
      <div className="buttonRow">
        <button className="signIn" onClick={signIn}>
          Google 로그인
        </button>
        <button className="signOut" onClick={signOut}>
          로그아웃
        </button>
      </div>
      <style jsx>{`
        .buttonRow {
          display: flex;
          gap: 0.5rem;
        }
        .signIn,
        .signOut {
          padding: 0.375rem 0.875rem;
          border-radius: 0.5rem;
          font-weight: 600;
          transition: background 0.2s ease, color 0.2s ease;
        }
        .signIn {
          background: #ef4444;
          color: #fff;
        }
        .signIn:hover {
          background: #dc2626;
        }
        .signOut {
          background: #e5e7eb;
          color: #111827;
        }
        .signOut:hover {
          background: #cbd5f5;
        }
      `}</style>
    </>
  )
}

//

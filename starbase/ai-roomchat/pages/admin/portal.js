import { useState } from 'react';
import Head from 'next/head';
import styles from '../../styles/AdminPortal.module.css';
import { parseCookies } from '@/lib/server/cookies';
import TitleBackgroundEditor from '@/components/admin/TitleBackgroundEditor';
import AnnouncementManager from '@/components/admin/AnnouncementManager';
import MatchmakingLogMonitor from '@/components/admin/MatchmakingLogMonitor';
import MatchmakingAnalytics from '@/components/admin/MatchmakingAnalytics';
import MockGameSimulator from '@/components/admin/MockGameSimulator';
import RealGameSimulator from '@/components/admin/RealGameSimulator';
import TestGameSimulator from '@/components/admin/TestGameSimulator';
import SessionInspector from '@/components/admin/SessionInspector';

const COOKIE_NAME = 'rank_admin_portal_session';

export default function AdminPortal({ authorized, misconfigured }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('matchmaking');

  const handleSubmit = async event => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: '로그인에 실패했습니다.' }));
        setStatus({ type: 'error', message: payload.error || '로그인에 실패했습니다.' });
        setLoading(false);
        return;
      }

      setStatus({ type: 'success', message: '인증되었습니다. 창이 새로고침됩니다.' });
      window.location.reload();
    } catch (error) {
      setStatus({ type: 'error', message: '네트워크 오류가 발생했습니다.' });
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Admin Portal</title>
      </Head>
      <main className={styles.main}>
        <h1 className={styles.title}>Rank Game Admin Portal</h1>
        {!authorized ? (
          <section className={styles.section}>
            {misconfigured ? (
              <div className={styles.callout} role="alert">
                <p className={styles.description}>
                  <strong>서버 환경이 아직 준비되지 않았습니다.</strong>
                </p>
                <p className={styles.description}>
                  배포 대상의 환경 변수에 <code>ADMIN_PORTAL_PASSWORD</code> 값을 설정한 뒤 다시
                  시도해주세요.
                </p>
                <p className={styles.description}>
                  필요한 변수 목록은 운영 문서의 <em>환경 변수 관리</em> 섹션에서 확인할 수
                  있습니다.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <p className={styles.description}>접근을 위해 관리자 비밀번호를 입력해주세요.</p>
                <label className={styles.label} htmlFor="admin-password">
                  관리자 비밀번호
                </label>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  className={styles.input}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={loading}
                />
                <button type="submit" className={styles.button} disabled={loading || !password}>
                  {loading ? '확인 중…' : '접속'}
                </button>
                {status && (
                  <p className={status.type === 'error' ? styles.error : styles.success}>
                    {status.message}
                  </p>
                )}
              </form>
            )}
          </section>
        ) : (
          <section className={styles.section}>
            <nav className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === 'matchmaking' ? styles.active : ''}`}
                onClick={() => setActiveTab('matchmaking')}
              >
                매칭/로그
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'analytics' ? styles.active : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                통계/집계
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'sessions' ? styles.active : ''}`}
                onClick={() => setActiveTab('sessions')}
              >
                세션 검사
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'simulators' ? styles.active : ''}`}
                onClick={() => setActiveTab('simulators')}
              >
                시뮬레이터
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'content' ? styles.active : ''}`}
                onClick={() => setActiveTab('content')}
              >
                콘텐츠 관리
              </button>
            </nav>

            <div className={styles.tabContent}>
              {activeTab === 'matchmaking' && (
                <div className={styles.tabPanel}>
                  <MatchmakingLogMonitor />
                </div>
              )}
              {activeTab === 'analytics' && (
                <div className={styles.tabPanel}>
                  <MatchmakingAnalytics />
                </div>
              )}
              {activeTab === 'sessions' && (
                <div className={styles.tabPanel}>
                  <SessionInspector />
                </div>
              )}
              {activeTab === 'simulators' && (
                <div className={styles.tabPanel}>
                  <MockGameSimulator />
                  <RealGameSimulator />
                  <TestGameSimulator />
                </div>
              )}
              {activeTab === 'content' && (
                <div className={styles.tabPanel}>
                  <TitleBackgroundEditor />
                  <AnnouncementManager />
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function resolvePassword() {
  const raw = process.env.ADMIN_PORTAL_PASSWORD;

  if (!raw || !raw.trim()) {
    return null;
  }

  return raw;
}

export async function getServerSideProps(context) {
  const { createHash } = await import('crypto');
  const password = resolvePassword();

  const cookieHeader = context.req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];

  if (!password) {
    return {
      props: {
        authorized: false,
        misconfigured: true,
      },
    };
  }

  const expectedToken = createHash('sha256').update(password).digest('hex');
  const authorized = Boolean(sessionToken && sessionToken === expectedToken);

  return {
    props: {
      authorized,
      misconfigured: false,
    },
  };
}

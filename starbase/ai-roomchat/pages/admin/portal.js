import { useState } from 'react';
import Head from 'next/head';
import styles from '../../styles/AdminPortal.module.css';
import { parse as parseCookie } from 'cookie';

const COOKIE_NAME = 'rank_admin_portal_session';

export default function AdminPortal({ authorized, misconfigured }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
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
                  배포 환경에 <code>ADMIN_PORTAL_PASSWORD</code> 값을 설정하고{' '}
                  <code>dotenv-vault</code>를 사용해 비밀 변수를 배포한 뒤 다시 시도해주세요.
                </p>
                <p className={styles.description}>
                  자세한 절차는 문서의 <em>환경 변수 관리</em> 섹션을 참고하면 됩니다.
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
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                />
                <button type="submit" className={styles.button} disabled={loading || !password}>
                  {loading ? '확인 중…' : '접속'}
                </button>
                {status && (
                  <p className={status.type === 'error' ? styles.error : styles.success}>{status.message}</p>
                )}
              </form>
            )}
          </section>
        ) : (
          <section className={styles.section}>
            <h2 className={styles.subtitle}>운영 준비 체크리스트</h2>
            <ul className={styles.list}>
              <li>
                <strong>서비스 롤 키</strong> – 스테이징/프로덕션 Supabase 프로젝트의 서비스 롤 키를 안전한 비밀 금고에 등록하고,
                크론·워커가 사용할 환경 변수로 배포합니다.
              </li>
              <li>
                <strong>스크립트 실행 환경</strong> – 백필·데이터 감사 스크립트를 실행할 Vercel 크론/서버리스 혹은 CLI 실행 공간을 확보하고,
                필요 패키지를 사전 설치합니다.
              </li>
              <li>
                <strong>역사 데이터 덤프</strong> – `rank_battle_logs`, `rank_sessions`, `rank_turns` 테이블의 스냅샷을 추출해 S3 등 장기 보관소에 저장합니다.
              </li>
              <li>
                <strong>QA 확인 창구</strong> – 모드 태깅·난입 로직 점검을 위한 QA 슬랙 채널과 일정표를 설정해 배포 전후 검증 루틴을 운영합니다.
              </li>
            </ul>

            <h2 className={styles.subtitle}>운영 링크</h2>
            <div className={styles.cards}>
              <article className={styles.card}>
                <h3>데이터 감사 스프레드시트</h3>
                <p>모드별 미태깅 로그, 시즌 스냅샷, 재현 스테이트를 정리한 감사 시트에 접근합니다.</p>
                <a className={styles.link} href="#" onClick={(event) => event.preventDefault()}>
                  링크 준비 중
                </a>
              </article>
              <article className={styles.card}>
                <h3>크론 실행 현황</h3>
                <p>Vercel Cron 혹은 워커 런북을 확인하고 백필 진행 상황을 기록합니다.</p>
                <a className={styles.link} href="#" onClick={(event) => event.preventDefault()}>
                  링크 준비 중
                </a>
              </article>
            </div>

            <h2 className={styles.subtitle}>연락 창구</h2>
            <p className={styles.description}>
              배포/백필 중 문제가 발생하면 <strong>rank-admin@starbase.dev</strong> 혹은 전용 슬랙 채널(#rank-admin-ops)로 바로 알려주세요.
            </p>
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
  const cookies = parseCookie(cookieHeader || '');
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

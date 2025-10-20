import { useCallback, useState } from 'react'
import { ensureRpc } from '@/modules/arena/rpcClient'
import styles from './OpsPanel.module.css'

const CHECKS = [
  { id: 'publication', rpc: 'audit_realtime_publication', label: 'Realtime publication 점검' },
  { id: 'ttl', rpc: 'run_rank_session_ttl_cleanup', label: '세션 TTL 정리' },
  { id: 'queue', rpc: 'reset_rank_queue', label: '큐 초기화' },
]

export function OpsPanel() {
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  const execute = useCallback(
    async (rpc) => {
      setRunning(true)
      try {
        const data = await ensureRpc(rpc)
        setResult({ rpc, data })
      } catch (error) {
        setResult({ rpc, error })
      } finally {
        setRunning(false)
      }
    },
    [setRunning, setResult],
  )

  return (
    <section className={styles.panel}>
      <header>
        <h2>운영 체크</h2>
        <p>주요 RPC를 수동 실행해 상태를 점검하세요.</p>
      </header>
      <div className={styles.buttons}>
        {CHECKS.map((check) => (
          <button key={check.id} disabled={running} onClick={() => execute(check.rpc)}>
            {check.label}
          </button>
        ))}
      </div>
      <div className={styles.output}>
        <h3>결과</h3>
        {result ? (
          <pre>{JSON.stringify(result, null, 2)}</pre>
        ) : (
          <p>RPC 실행 결과가 여기에 표시됩니다.</p>
        )}
      </div>
    </section>
  )
}

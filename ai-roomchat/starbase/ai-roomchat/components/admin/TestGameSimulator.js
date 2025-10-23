import { useState, useEffect, useCallback } from 'react';
import styles from './CooldownDashboard.module.css';

export default function TestGameSimulator() {
  const [games, setGames] = useState([]);
  const [heroes, setHeroes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [useRealTables, setUseRealTables] = useState(true);
  
  const [selectedGame, setSelectedGame] = useState('');
  const [selectedHeroes, setSelectedHeroes] = useState([]);
  const [mode, setMode] = useState('rank_solo');
  const [turnLimit, setTurnLimit] = useState(10);
  const [autoTurns, setAutoTurns] = useState(5);
  const [apiKey, setApiKey] = useState('');
  
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [selftestResults, setSelftestResults] = useState(null);

  // 초기 데이터 로드
  useEffect(() => {
    loadInitialData();
    loadSessions();
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
  }, []);

  const loadInitialData = async () => {
    try {
      // 게임 목록
      const gamesRes = await fetch('/api/admin/mock-game-real/data');
      if (gamesRes.ok) {
        const data = await gamesRes.json();
        setGames(data.games || []);
        setHeroes(data.heroes || []);
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    }
  };

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(useRealTables ? '/api/admin/real-sim/list' : '/api/admin/test-sim/list');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('세션 목록 로드 실패:', error);
    }
  }, [useRealTables]);

  const createSimulation = async () => {
    if (!selectedGame || selectedHeroes.length === 0) {
      setStatus('게임과 히어로를 선택해주세요.');
      return;
    }

    setLoading(true);
    setStatus('시뮬레이션 생성 중...');

    try {
      const res = await fetch(useRealTables ? '/api/admin/real-sim/create' : '/api/admin/test-sim/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: selectedGame,
          mode,
          heroIds: selectedHeroes,
          turnLimit,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '생성 실패');
      }

      const result = await res.json();
      setStatus(`✅ 생성 완료! 세션 ID: ${result.sessionId.slice(0, 8)}...`);
      setCurrentSession(result.sessionId);
      await loadSessions();
      await loadSessionDetail(result.sessionId);
    } catch (error) {
      setStatus(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetail = async (sessionId) => {
    try {
      const base = useRealTables ? '/api/admin/real-sim' : '/api/admin/test-sim';
      const res = await fetch(`${base}/${sessionId}/detail`);
      if (res.ok) {
        const data = await res.json();
        setSessionDetail(data);
      }
    } catch (error) {
      console.error('세션 상세 로드 실패:', error);
    }
  };

  const advanceSimulation = async (sessionId, turns) => {
    setLoading(true);
    setStatus(`${turns}턴 자동 진행 중...`);

    try {
      const base = useRealTables ? '/api/admin/real-sim' : '/api/admin/test-sim';
      const res = await fetch(`${base}/${sessionId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns,
          apiKey: apiKey || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '진행 실패');
      }

      const data = await res.json();
      setStatus(`✅ ${data.results.length}턴 진행 완료`);
      await loadSessionDetail(sessionId);
      await loadSessions();
    } catch (error) {
      setStatus(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteSimulation = async (sessionId) => {
    if (!confirm('이 시뮬레이션을 삭제하시겠습니까?')) return;

    try {
      const base = useRealTables ? '/api/admin/real-sim' : '/api/admin/test-sim';
      const res = await fetch(`${base}/${sessionId}/delete`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setStatus('✅ 삭제 완료');
        if (currentSession === sessionId) {
          setCurrentSession(null);
          setSessionDetail(null);
        }
        await loadSessions();
      }
    } catch (error) {
      setStatus(`❌ 삭제 실패: ${error.message}`);
    }
  };

  const toggleHeroSelection = (heroId) => {
    setSelectedHeroes(prev => 
      prev.includes(heroId)
        ? prev.filter(id => id !== heroId)
        : [...prev, heroId]
    );
  };

  const runSelftest = async () => {
    if (!useRealTables) {
      setStatus('❌ 셀프테스트는 real 모드에서만 실행됩니다.');
      return;
    }
    setLoading(true);
    setStatus('🧪 셀프테스트 실행 중...');
    setSelftestResults(null);
    try {
      const res = await fetch('/api/admin/real-sim/selftest', { method: 'POST' });
      if (!res.ok) throw new Error('셀프테스트 실패');
      const data = await res.json();
      setSelftestResults(data);
      setStatus(data.ok ? '✅ 셀프테스트 완료' : '❌ 셀프테스트 실패');
    } catch (error) {
      setStatus(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>🧪 테스트 게임 시뮬레이터</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <label style={{ fontSize: '14px', color: '#555' }}>테이블</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="radio" name="tableMode" checked={useRealTables} onChange={() => setUseRealTables(true)} />
          <span>real (rank_*)</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="radio" name="tableMode" checked={!useRealTables} onChange={() => setUseRealTables(false)} />
          <span>test (test_rank_*)</span>
        </label>
        {useRealTables && (
          <button
            onClick={runSelftest}
            disabled={loading}
            className={styles.button}
            style={{ marginLeft: 'auto', fontSize: '12px', padding: '5px 10px' }}
          >
            {loading ? '실행 중...' : '🧪 셀프테스트'}
          </button>
        )}
      </div>
      <p style={{ fontSize: '14px', color: '#888', marginBottom: '20px' }}>
        실제 매칭 로직 + {useRealTables ? '실제 rank_* 테이블' : 'test_rank_* 테이블'} 사용 (자동 진행 가능)
      </p>

      {/* 셀프테스트 결과 */}
      {selftestResults && (
        <div style={{ marginBottom: '20px', padding: '15px', background: selftestResults.ok ? '#e8f5e9' : '#ffebee', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>
            {selftestResults.ok ? '✅ 셀프테스트 통과' : '❌ 셀프테스트 실패'}
          </h3>
          <div style={{ fontSize: '13px', fontFamily: 'monospace' }}>
            {selftestResults.steps.map((step, idx) => (
              <div key={idx} style={{ marginBottom: '8px', paddingLeft: '10px', borderLeft: step.status === 'ok' ? '3px solid #4caf50' : '3px solid #f44336' }}>
                <div><strong>{step.name}</strong> - {step.status} ({step.durationMs}ms)</div>
                {step.gameId && <div style={{ color: '#666', fontSize: '12px' }}>gameId: {step.gameId}, heroCount: {step.heroCount}</div>}
                {step.sessionId && <div style={{ color: '#666', fontSize: '12px' }}>sessionId: {step.sessionId}</div>}
                {step.turn !== undefined && <div style={{ color: '#666', fontSize: '12px' }}>turn: {step.turn}, battles: {step.battles}</div>}
                {step.results && <div style={{ color: '#666', fontSize: '12px' }}>results: {JSON.stringify(step.results)}</div>}
                {step.message && <div style={{ color: '#d32f2f', fontSize: '12px' }}>ERROR: {step.message}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 생성 폼 */}
      <div style={{ marginBottom: '30px', padding: '15px', background: '#f9f9f9', borderRadius: '8px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '15px' }}>새 시뮬레이션 생성</h3>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            게임 선택
          </label>
          <select 
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            disabled={loading}
            style={{ width: '100%', padding: '8px' }}
          >
            <option value="">게임을 선택하세요</option>
            {games.map(game => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            히어로 선택 ({selectedHeroes.length}개 선택됨)
          </label>
          <div style={{ 
            maxHeight: '150px', 
            overflowY: 'auto', 
            border: '1px solid #ddd', 
            padding: '10px',
            background: '#fff',
            borderRadius: '4px'
          }}>
            {heroes.map(hero => (
              <label 
                key={hero.id}
                style={{ 
                  display: 'block', 
                  marginBottom: '5px',
                  cursor: 'pointer',
                  padding: '5px',
                  background: selectedHeroes.includes(hero.id) ? '#e3f2fd' : 'transparent',
                  borderRadius: '4px'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedHeroes.includes(hero.id)}
                  onChange={() => toggleHeroSelection(hero.id)}
                  disabled={loading}
                  style={{ marginRight: '8px' }}
                />
                {hero.name}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '15px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              모드
            </label>
            <select 
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={loading}
              style={{ width: '100%', padding: '8px' }}
            >
              <option value="rank_solo">랭크 솔로</option>
              <option value="rank_duo">랭크 듀오</option>
              <option value="casual_match">캐주얼 매치</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              최대 턴 수
            </label>
            <input
              type="number"
              value={turnLimit}
              onChange={(e) => setTurnLimit(Number(e.target.value))}
              disabled={loading}
              min="1"
              max="100"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
        </div>

        <button
          onClick={createSimulation}
          disabled={loading || !selectedGame || selectedHeroes.length === 0}
          className={styles.button}
          style={{ width: '100%', marginBottom: '10px' }}
        >
          {loading ? '생성 중...' : '🎮 시뮬레이션 생성'}
        </button>

        {status && (
          <div style={{ 
            padding: '10px', 
            background: status.includes('❌') ? '#ffebee' : '#e8f5e9',
            borderRadius: '4px',
            fontSize: '14px'
          }}>
            {status}
          </div>
        )}
      </div>

      {/* 현재 세션 상세 */}
      {sessionDetail && (
        <div style={{ marginBottom: '30px', padding: '15px', background: '#fff3e0', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '15px' }}>
            📊 현재 세션: {currentSession?.slice(0, 8)}...
          </h3>
          
          <div style={{ marginBottom: '15px' }}>
            <strong>상태:</strong> {sessionDetail.session.status} | 
            <strong> 턴:</strong> {sessionDetail.session.turn}/{(sessionDetail.session.test_rank_session_meta?.[0]?.turn_limit) || sessionDetail.session.turn_limit || 10} | 
            <strong> 배틀:</strong> {sessionDetail.battles.length}개
          </div>

          <div style={{ marginBottom: '15px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <input
              type="number"
              value={autoTurns}
              onChange={(e) => setAutoTurns(Number(e.target.value))}
              disabled={loading}
              min="1"
              max="50"
              placeholder="진행할 턴 수"
              style={{ padding: '8px' }}
            />
            <button
              onClick={() => advanceSimulation(currentSession, autoTurns)}
              disabled={loading || sessionDetail.session.status !== 'active'}
              className={styles.button}
            >
              ▶️ 자동 진행
            </button>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '13px', color: '#666' }}>
              OpenAI API 키 (선택사항, AI 응답용):
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{ width: '100%', padding: '6px', fontSize: '13px' }}
            />
          </div>

          {sessionDetail.battles.length > 0 && (
            <details style={{ marginTop: '15px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '10px' }}>
                배틀 기록 ({sessionDetail.battles.length}개)
              </summary>
              <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '13px' }}>
                {sessionDetail.battles.map((battle, idx) => (
                  <div 
                    key={battle.id} 
                    style={{ 
                      padding: '8px', 
                      background: idx % 2 === 0 ? '#f5f5f5' : '#fff',
                      marginBottom: '5px',
                      borderRadius: '4px'
                    }}
                  >
                    <div><strong>배틀 #{idx + 1}</strong> - {battle.result}</div>
                    <div style={{ color: '#666', fontSize: '12px' }}>
                      {new Date(battle.created_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          <button
            onClick={() => deleteSimulation(currentSession)}
            className={styles.button}
            style={{ width: '100%', marginTop: '10px', background: '#d32f2f' }}
          >
            🗑️ 이 세션 삭제
          </button>
        </div>
      )}

      {/* 세션 목록 */}
      <div>
        <h3 style={{ fontSize: '16px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          📋 활성 세션 목록
          <button
            onClick={loadSessions}
            className={styles.button}
            style={{ fontSize: '12px', padding: '5px 10px' }}
          >
            🔄 새로고침
          </button>
        </h3>

        {sessions.length === 0 ? (
          <p style={{ color: '#888', fontSize: '14px' }}>세션이 없습니다.</p>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {sessions.map(session => (
              <div 
                key={session.id}
                style={{
                  padding: '12px',
                  background: currentSession === session.id ? '#e3f2fd' : '#f9f9f9',
                  marginBottom: '8px',
                  borderRadius: '6px',
                  border: '1px solid #ddd'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <strong>{session.rank_games?.name || '게임'}</strong>
                    <span style={{ marginLeft: '10px', fontSize: '13px', color: '#666' }}>
                      {session.mode}
                    </span>
                  </div>
                  <span style={{ 
                    fontSize: '12px', 
                    padding: '3px 8px', 
                    background: session.status === 'active' ? '#4caf50' : '#9e9e9e',
                    color: '#fff',
                    borderRadius: '12px'
                  }}>
                    {session.status}
                  </span>
                </div>
                
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                  턴: {session.turn}/{(session.test_rank_session_meta?.[0]?.turn_limit) || session.turn_limit || 10} | 
                  생성: {new Date(session.created_at).toLocaleString('ko-KR')}
                </div>

                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    onClick={() => {
                      setCurrentSession(session.id);
                      loadSessionDetail(session.id);
                    }}
                    className={styles.button}
                    style={{ fontSize: '12px', padding: '5px 10px', flex: 1 }}
                  >
                    📖 불러오기
                  </button>
                  <button
                    onClick={() => deleteSimulation(session.id)}
                    className={styles.button}
                    style={{ fontSize: '12px', padding: '5px 10px', background: '#d32f2f' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

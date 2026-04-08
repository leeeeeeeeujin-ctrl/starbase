'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const pageStyle = {
  minHeight: '100vh',
  background: '#020617',
  color: '#e2e8f0',
  padding: '32px 20px 80px',
};

const shellStyle = {
  width: '100%',
  maxWidth: 1120,
  margin: '0 auto',
  display: 'grid',
  gap: 20,
};

const cardStyle = {
  padding: 20,
  borderRadius: 24,
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'rgba(15,23,42,0.78)',
};

function cloneCombatant(entry, overrides = {}) {
  const baseStats = entry?.profile?.baseStats || {};
  const maxHp = Number(baseStats.hp || 1) + 40;
  return {
    id: entry?.id || 'unknown',
    name: entry?.name || '이름 없음',
    sprite:
      entry?.sprites?.front ||
      entry?.sprites?.back ||
      entry?.sprites?.icon ||
      entry?.source?.imageUrl ||
      '/icon.png',
    level: overrides.level || 5,
    maxHp,
    hp: maxHp,
    speed: Number(baseStats.speed || 1),
    attack: Number(baseStats.attack || 1),
    defense: Number(baseStats.defense || 1),
    moves: Array.isArray(entry?.profile?.moves?.starting)
      ? entry.profile.moves.starting
      : Array.isArray(entry?.profile?.movePool)
        ? entry.profile.movePool.slice(0, 4)
        : [],
    entry,
  };
}

function fallbackPlayer() {
  return {
    id: 'debug-player-001',
    name: '디버그 플레이어',
    region: 'starter-plains',
    tier: 'common',
    playable: true,
    sprites: {
      front: '/icon.png',
      back: '/icon.png',
      icon: '/icon.png',
    },
    profile: {
      baseStats: {
        hp: 74,
        attack: 78,
        defense: 72,
        spAttack: 66,
        spDefense: 68,
        speed: 71,
      },
      moves: {
        starting: ['tackle', 'guard-pose', 'quick-attack', 'focus'],
      },
      movePool: ['tackle', 'guard-pose', 'quick-attack', 'focus'],
      types: ['normal'],
      biography: '포켓로그 검증용 플레이어 기본 엔트리',
    },
    source: {
      imageUrl: '/icon.png',
    },
  };
}

function computeDamage(attacker, defender, moveName) {
  const movePower = 24 + Math.max(0, String(moveName || '').length);
  const raw = attacker.attack + movePower - defender.defense / 2;
  return Math.max(8, Math.round(raw));
}

function HealthBar({ current, max, accent = '#38bdf8' }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <div
      style={{
        width: '100%',
        height: 14,
        borderRadius: 999,
        overflow: 'hidden',
        background: 'rgba(15,23,42,0.9)',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <div
        style={{
          width: `${ratio * 100}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${accent} 0%, #22d3ee 100%)`,
          transition: 'width 180ms ease',
        }}
      />
    </div>
  );
}

function CombatantCard({ title, combatant, accent, right = false }) {
  return (
    <section
      style={{
        ...cardStyle,
        display: 'grid',
        gap: 14,
        justifyItems: right ? 'end' : 'start',
        textAlign: right ? 'right' : 'left',
      }}
    >
      <div style={{ display: 'grid', gap: 4, width: '100%' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{title}</span>
        <strong style={{ fontSize: 24 }}>{combatant.name}</strong>
        <span style={{ fontSize: 13, color: '#cbd5e1' }}>Lv. {combatant.level}</span>
      </div>
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: 24,
          border: '1px solid rgba(148,163,184,0.22)',
          background:
            'linear-gradient(45deg, rgba(30,41,59,0.95) 25%, rgba(15,23,42,0.95) 25%, rgba(15,23,42,0.95) 50%, rgba(30,41,59,0.95) 50%, rgba(30,41,59,0.95) 75%, rgba(15,23,42,0.95) 75%)',
          backgroundSize: '18px 18px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={combatant.sprite}
          alt={combatant.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
        />
      </div>
      <div style={{ width: '100%', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
          <span>HP</span>
          <strong>
            {combatant.hp} / {combatant.maxHp}
          </strong>
        </div>
        <HealthBar current={combatant.hp} max={combatant.maxHp} accent={accent} />
      </div>
      <div style={{ display: 'grid', gap: 6, width: '100%' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>시작 기술</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: right ? 'flex-end' : 'flex-start' }}>
          {(combatant.moves || []).map(move => (
            <span
              key={move}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(15,23,42,0.72)',
                border: '1px solid rgba(148,163,184,0.2)',
                fontSize: 12,
                color: '#e2e8f0',
              }}
            >
              {move}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PokeroguePlaygroundPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);
  const [firstRival, setFirstRival] = useState(null);
  const [playerId, setPlayerId] = useState('');
  const [battleState, setBattleState] = useState(null);
  const [logLines, setLogLines] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/pokerogue/participants');
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'pokerogue_participants_fetch_failed');
        }
        if (cancelled) return;
        const nextEntries = Array.isArray(payload.entries) ? payload.entries : [];
        const playable = nextEntries.filter(entry => entry.playable && !entry.isTestEntry);
        setEntries(nextEntries);
        setFirstRival(payload.firstRival || null);
        setPlayerId(playable[0]?.id || '');
      } catch (fetchError) {
        if (!cancelled) setError(fetchError?.message || '포켓로그 데이터를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const playableEntries = useMemo(
    () => entries.filter(entry => entry.playable && !entry.isTestEntry),
    [entries]
  );

  const selectedPlayerEntry = useMemo(() => {
    return playableEntries.find(entry => entry.id === playerId) || fallbackPlayer();
  }, [playableEntries, playerId]);

  const startBattle = () => {
    const playerCombatant = cloneCombatant(selectedPlayerEntry, { level: 5 });
    const rivalCombatant = cloneCombatant(firstRival || fallbackPlayer(), { level: 6 });
    setBattleState({
      round: 1,
      player: playerCombatant,
      rival: rivalCombatant,
      finished: false,
      winner: null,
    });
    setLogLines([
      `전투 시작: ${playerCombatant.name} vs ${rivalCombatant.name}`,
      `${rivalCombatant.name} 는 첫 라이벌전 고정 엔트리로 로드됨`,
    ]);
  };

  const nextTurn = () => {
    setBattleState(prev => {
      if (!prev || prev.finished) return prev;

      const player = { ...prev.player };
      const rival = { ...prev.rival };
      const turnLog = [];

      const order = player.speed >= rival.speed
        ? [
            { attacker: player, defender: rival, actor: 'player' },
            { attacker: rival, defender: player, actor: 'rival' },
          ]
        : [
            { attacker: rival, defender: player, actor: 'rival' },
            { attacker: player, defender: rival, actor: 'player' },
          ];

      for (const step of order) {
        if (player.hp <= 0 || rival.hp <= 0) break;
        const move = step.attacker.moves?.[0] || 'struggle';
        const damage = computeDamage(step.attacker, step.defender, move);
        step.defender.hp = Math.max(0, step.defender.hp - damage);
        turnLog.push(
          `${step.attacker.name} used ${move} → ${step.defender.name} 에게 ${damage} 피해`
        );
      }

      let finished = false;
      let winner = null;
      if (player.hp <= 0 || rival.hp <= 0) {
        finished = true;
        winner = player.hp > 0 ? player.name : rival.name;
        turnLog.push(`전투 종료: 승자 ${winner}`);
      }

      setLogLines(lines => [...lines, ...turnLog]);

      return {
        round: prev.round + 1,
        player,
        rival,
        finished,
        winner,
      };
    });
  };

  const resetBattle = () => {
    setBattleState(null);
    setLogLines([]);
  };

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 28 }}>포켓로그 플레이그라운드</h1>
              <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.7 }}>
                본판 포켓로그에 넣기 전, 우리 시스템이 조립한 엔트리로 첫 라이벌전 시뮬레이션을
                돌려보는 검증 페이지다.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href="/pokerogue"
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.28)',
                  color: '#e2e8f0',
                  textDecoration: 'none',
                }}
              >
                참여 목록
              </Link>
              <a
                href="/api/pokerogue/participants"
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
                  color: '#0f172a',
                  textDecoration: 'none',
                  fontWeight: 800,
                }}
              >
                JSON 열기
              </a>
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6, minWidth: 260, flex: '1 1 260px' }}>
              <span style={{ fontSize: 13, color: '#cbd5e1' }}>플레이어 엔트리</span>
              <select
                value={playerId}
                onChange={event => setPlayerId(event.target.value)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.55)',
                  color: '#f8fafc',
                }}
              >
                {!playableEntries.length ? <option value="">디버그 플레이어 사용</option> : null}
                {playableEntries.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.region || '지역 미지정'}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={startBattle}
              disabled={loading || !!error || !firstRival}
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
                color: '#0f172a',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              첫 라이벌전 시작
            </button>
            <button
              type="button"
              onClick={nextTurn}
              disabled={!battleState || battleState.finished}
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.28)',
                background: 'rgba(15,23,42,0.72)',
                color: '#e2e8f0',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              턴 진행
            </button>
            <button
              type="button"
              onClick={resetBattle}
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.28)',
                background: 'transparent',
                color: '#cbd5e1',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              리셋
            </button>
          </div>

          {error ? <p style={{ margin: 0, color: '#fca5a5' }}>{error}</p> : null}
          {loading ? <p style={{ margin: 0, color: '#94a3b8' }}>로딩 중…</p> : null}
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <CombatantCard
            title="플레이어 측"
            combatant={battleState?.player || cloneCombatant(selectedPlayerEntry, { level: 5 })}
            accent="#38bdf8"
          />
          <CombatantCard
            title="첫 라이벌전"
            combatant={battleState?.rival || cloneCombatant(firstRival || fallbackPlayer(), { level: 6 })}
            accent="#f97316"
            right
          />
        </section>

        <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>전투 로그</h2>
            {battleState?.finished ? (
              <strong style={{ color: '#67e8f9' }}>승자: {battleState.winner}</strong>
            ) : battleState ? (
              <span style={{ color: '#94a3b8' }}>라운드 {battleState.round}</span>
            ) : null}
          </div>
          <div
            style={{
              display: 'grid',
              gap: 8,
              padding: 16,
              borderRadius: 18,
              background: 'rgba(2,6,23,0.82)',
              border: '1px solid rgba(51,65,85,0.8)',
              minHeight: 180,
            }}
          >
            {logLines.length ? (
              logLines.map((line, index) => (
                <div key={`${index}-${line}`} style={{ fontSize: 13, color: '#e2e8f0' }}>
                  {line}
                </div>
              ))
            ) : (
              <p style={{ margin: 0, color: '#94a3b8' }}>
                아직 전투를 시작하지 않았다. 첫 라이벌전 시작 버튼으로 시뮬레이션을 실행하면 로그가
                쌓인다.
              </p>
            )}
          </div>
        </section>

        <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>첫 라이벌전 원본 엔트리</h2>
          <pre
            style={{
              margin: 0,
              padding: 16,
              borderRadius: 18,
              background: 'rgba(2,6,23,0.82)',
              border: '1px solid rgba(51,65,85,0.8)',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(firstRival, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}

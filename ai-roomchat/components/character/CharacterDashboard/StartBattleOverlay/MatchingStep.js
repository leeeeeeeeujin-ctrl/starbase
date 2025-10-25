import { matchingStyles } from './styles';

export default function MatchingStep({ hero, opponentCards, progress }) {
  const participants = [
    {
      id: hero?.id || 'self',
      portrait: hero?.image_url,
      name: hero?.name || '이름 없는 캐릭터',
      role: '내 캐릭터',
      self: true,
    },
    ...opponentCards.map((opponent, index) => ({
      id: opponent.id || `opponent-${index}`,
      portrait: opponent.portrait,
      name: opponent.name,
      role: opponent.role ? `${opponent.role} 역할` : '상대방',
      self: false,
      order: index,
    })),
  ];

  return (
    <section style={matchingStyles.section}>
      <div style={matchingStyles.card}>
        <strong style={matchingStyles.title}>상대 준비 중…</strong>
        <p style={matchingStyles.copy}>
          참가자들의 전투 준비 상태를 확인하는 중입니다. 모두 준비되면 자동으로 전투 대기 화면으로
          이동합니다.
        </p>
        <div style={matchingStyles.progressBar}>
          <div style={{ ...matchingStyles.progressIndicator, width: `${progress}%` }} />
        </div>
        <span style={matchingStyles.progressValue}>{progress}%</span>
      </div>

      <div style={matchingStyles.list}>
        {participants.map((entry, index) => {
          const readyThreshold = entry.self ? 20 : 60 + index * 10;
          const ready = progress >= Math.min(readyThreshold, 95);
          const displayRole = entry.self ? '내 캐릭터' : entry.role;
          return (
            <div key={entry.id} style={matchingStyles.row}>
              <div style={matchingStyles.identity}>
                <div style={matchingStyles.portrait}>
                  {entry.portrait ? (
                    <img src={entry.portrait} alt={entry.name} style={matchingStyles.image} />
                  ) : (
                    <div style={matchingStyles.placeholder}>{entry.self ? 'YOU' : 'VS'}</div>
                  )}
                </div>
                <div>
                  <strong style={matchingStyles.name}>{entry.name}</strong>
                  <span style={matchingStyles.role}>{displayRole}</span>
                </div>
              </div>
              <span style={{ ...matchingStyles.status, color: ready ? '#4ade80' : '#cbd5f5' }}>
                {ready ? '준비 완료' : '대기 중…'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

//

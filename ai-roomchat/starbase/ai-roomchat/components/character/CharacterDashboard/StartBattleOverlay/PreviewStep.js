
import { baseStyles, previewStyles } from './styles'

export default function PreviewStep({
  hero,
  selectedEntry,
  opponentCards,
  onCancel,
  onRequestStart,
}) {
  return (
    <>
      <section style={previewStyles.container}>
        <div style={previewStyles.heroSummary}>
          <div style={previewStyles.heroPortrait}>
            {hero?.image_url ? (
              <img src={hero.image_url} alt={hero?.name || '내 캐릭터'} style={previewStyles.heroImage} />
            ) : (
              <div style={previewStyles.heroPlaceholder}>YOU</div>
            )}
          </div>
          <div style={previewStyles.heroCopy}>
            <strong style={previewStyles.heroName}>{hero?.name || '이름 없는 캐릭터'}</strong>
            <span style={previewStyles.heroRole}>
              {selectedEntry?.role ? `${selectedEntry.role} 역할` : '참여자'}
            </span>
          </div>
        </div>
        <p style={previewStyles.heroHelp}>
          선택한 게임에서 함께 싸울 다른 참가자들을 확인하세요. 능력과 역할을 검토한 뒤 다시 한번 “게임 시작”을 눌러 매칭을
          진행합니다.
        </p>
      </section>

      <section style={previewStyles.opponentList}>
        {opponentCards.length ? (
          opponentCards.map((opponent) => (
            <article key={opponent.id} style={previewStyles.opponentCard}>
              <div style={previewStyles.opponentHeader}>
                <div style={previewStyles.opponentPortrait}>
                  {opponent.portrait ? (
                    <img src={opponent.portrait} alt={opponent.name} style={previewStyles.opponentImage} />
                  ) : (
                    <div style={previewStyles.opponentPlaceholder}>VS</div>
                  )}
                </div>
                <div style={previewStyles.opponentCopy}>
                  <strong style={previewStyles.opponentName}>{opponent.name}</strong>
                  <span style={previewStyles.opponentRole}>
                    {opponent.role ? `${opponent.role} 역할` : '참가자'}
                  </span>
                </div>
              </div>
              {opponent.abilities.length ? (
                <div style={previewStyles.abilityList}>
                  {opponent.abilities.map((ability, index) => (
                    <div key={`${opponent.id}-ability-${index}`} style={previewStyles.abilityChip}>
                      {ability}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div style={previewStyles.emptyOpponents}>
            아직 다른 참가자가 없습니다. 잠시 후 다시 시도하거나 게임 로비에서 새 전투를 만들어 보세요.
          </div>
        )}
      </section>

      <div style={baseStyles.actionRow}>
        <button type="button" onClick={onCancel} style={baseStyles.secondaryButton}>
          취소
        </button>
        <button type="button" onClick={onRequestStart} style={baseStyles.primaryButton}>
          게임 시작
        </button>
      </div>
    </>
  )
}

//

import { modalStyles } from './styles'

export default function HeroAbilitiesSection({
  abilityCards,
  onChangeEdit,
  onAddAbility,
  onReverseAbilities,
  onClearAbility,
}) {
  return (
    <>
      <div style={modalStyles.abilityGrid}>
        {abilityCards.map((ability, index) => (
          <div key={ability.key} style={modalStyles.abilityCard}>
            <div style={modalStyles.abilityHeader}>
              <span style={modalStyles.abilityTitle}>능력 {index + 1}</span>
              {ability.value ? (
                <button type="button" onClick={() => onClearAbility(ability.key)} style={modalStyles.removeAbility}>
                  삭제
                </button>
              ) : null}
            </div>
            <textarea
              value={ability.value}
              onChange={(event) => onChangeEdit(ability.key, event.target.value)}
              rows={4}
              style={{ ...modalStyles.textInput, resize: 'vertical', minHeight: 140 }}
              placeholder="능력 설명을 입력하세요."
            />
          </div>
        ))}
      </div>
      <div style={modalStyles.abilityActions}>
        <button type="button" onClick={onAddAbility} style={modalStyles.addAbility}>
          능력 생성
        </button>
        <button type="button" onClick={onReverseAbilities} style={modalStyles.reorderAbility}>
          능력 순서 수정
        </button>
      </div>
    </>
  )
}

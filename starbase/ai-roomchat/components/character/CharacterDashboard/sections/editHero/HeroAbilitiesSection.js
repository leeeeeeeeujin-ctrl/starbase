import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { modalStyles } from './styles'

export default function HeroAbilitiesSection({
  abilityCards,
  onChangeEdit,
  onAddAbility,
  onReverseAbilities,
  onClearAbility,
}) {
  const [draftValues, setDraftValues] = useState(() => {
    const initial = {}
    abilityCards.forEach((ability) => {
      initial[ability.key] = ability.value || ''
    })
    return initial
  })

  const abilityValueMap = useMemo(() => {
    const map = new Map()
    abilityCards.forEach((ability) => {
      map.set(ability.key, ability.value || '')
    })
    return map
  }, [abilityCards])

  const dirtyKeysRef = useRef(new Set())

  useEffect(() => {
    setDraftValues((prev) => {
      const next = { ...prev }
      abilityCards.forEach((ability) => {
        if (!dirtyKeysRef.current.has(ability.key)) {
          next[ability.key] = ability.value || ''
        }
      })
      return next
    })
  }, [abilityCards])

  const handleAbilityChange = useCallback(
    (key, value) => {
      dirtyKeysRef.current.add(key)
      setDraftValues((prev) => ({ ...prev, [key]: value }))
      onChangeEdit(key, value)
    },
    [onChangeEdit],
  )

  const handleAbilityFocus = useCallback((key) => {
    dirtyKeysRef.current.add(key)
  }, [])

  const handleAbilityBlur = useCallback(
    (key) => {
      dirtyKeysRef.current.delete(key)
      setDraftValues((prev) => ({ ...prev, [key]: abilityValueMap.get(key) || '' }))
    },
    [abilityValueMap],
  )

  const handleClear = useCallback(
    (key) => {
      dirtyKeysRef.current.delete(key)
      setDraftValues((prev) => ({ ...prev, [key]: '' }))
      onClearAbility(key)
    },
    [onClearAbility],
  )

  const handleReverse = useCallback(() => {
    dirtyKeysRef.current = new Set()
    onReverseAbilities()
  }, [onReverseAbilities])

  return (
    <>
      <div style={modalStyles.abilityGrid}>
        {abilityCards.map((ability, index) => (
          <div key={ability.key} style={modalStyles.abilityCard}>
            <div style={modalStyles.abilityHeader}>
              <span style={modalStyles.abilityTitle}>능력 {index + 1}</span>
              {ability.value ? (
                <button type="button" onClick={() => handleClear(ability.key)} style={modalStyles.removeAbility}>
                  삭제
                </button>
              ) : null}
            </div>
            <textarea
              value={draftValues[ability.key] ?? ''}
              onChange={(event) => handleAbilityChange(ability.key, event.target.value)}
              onFocus={() => handleAbilityFocus(ability.key)}
              onBlur={() => handleAbilityBlur(ability.key)}
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
        <button type="button" onClick={handleReverse} style={modalStyles.reorderAbility}>
          능력 순서 수정
        </button>
      </div>
    </>
  )
}

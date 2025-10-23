
import { baseStyles, readyStyles } from './styles'

export default function ReadyStep({ onBack, onConfirm }) {
  return (
    <section style={readyStyles.section}>
      <div style={readyStyles.card}>
        <strong style={readyStyles.title}>모든 참가자가 준비되었습니다!</strong>
        <p style={readyStyles.copy}>
          전투 준비가 끝났습니다. 아래 버튼을 눌러 게임 방으로 이동하세요. 로딩 화면에서는 각 참가자의 초상화가 표시되며 게임이
          곧 시작됩니다.
        </p>
      </div>
      <div style={baseStyles.actionRow}>
        <button type="button" onClick={onBack} style={baseStyles.secondaryButton}>
          뒤로
        </button>
        <button type="button" onClick={onConfirm} style={baseStyles.primaryButton}>
          전투 대기실로 이동
        </button>
      </div>
    </section>
  )
}

//

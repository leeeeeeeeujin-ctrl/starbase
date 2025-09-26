import { modalStyles } from './styles'

export default function HeroDetailsForm({ name, description, onChange }) {
  return (
    <>
      <div style={modalStyles.inputGroup}>
        <label style={modalStyles.label}>이름</label>
        <input
          type="text"
          value={name}
          onChange={(event) => onChange('name', event.target.value)}
          style={modalStyles.textInput}
          placeholder="영웅 이름을 입력하세요"
        />
      </div>
      <div style={modalStyles.inputGroup}>
        <label style={modalStyles.label}>소개</label>
        <textarea
          value={description}
          onChange={(event) => onChange('description', event.target.value)}
          rows={4}
          style={{ ...modalStyles.textInput, resize: 'vertical', minHeight: 160 }}
          placeholder="영웅 소개를 입력하세요"
        />
      </div>
    </>
  )
}

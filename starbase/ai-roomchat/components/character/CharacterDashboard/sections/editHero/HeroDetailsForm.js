import { useEffect, useRef, useState } from 'react'

import { modalStyles } from './styles'

export default function HeroDetailsForm({ name, description, onChange }) {
  const [draftName, setDraftName] = useState(name ?? '')
  const [draftDescription, setDraftDescription] = useState(description ?? '')
  const dirtyRef = useRef({ name: false, description: false })

  useEffect(() => {
    if (!dirtyRef.current.name || name === draftName) {
      setDraftName(name ?? '')
    }
  }, [name, draftName])

  useEffect(() => {
    if (!dirtyRef.current.description || description === draftDescription) {
      setDraftDescription(description ?? '')
    }
  }, [description, draftDescription])

  const handleNameChange = (event) => {
    const value = event.target.value
    dirtyRef.current.name = true
    setDraftName(value)
    onChange('name', value)
  }

  const handleDescriptionChange = (event) => {
    const value = event.target.value
    dirtyRef.current.description = true
    setDraftDescription(value)
    onChange('description', value)
  }

  const handleNameBlur = () => {
    dirtyRef.current.name = false
  }

  const handleDescriptionBlur = () => {
    dirtyRef.current.description = false
  }

  return (
    <>
      <div style={modalStyles.inputGroup}>
        <label style={modalStyles.label}>이름</label>
        <input
          type="text"
          value={draftName}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          style={modalStyles.textInput}
          placeholder="영웅 이름을 입력하세요"
        />
      </div>
      <div style={modalStyles.inputGroup}>
        <label style={modalStyles.label}>소개</label>
        <textarea
          value={draftDescription}
          onChange={handleDescriptionChange}
          onBlur={handleDescriptionBlur}
          rows={4}
          style={{ ...modalStyles.textInput, resize: 'vertical', minHeight: 160 }}
          placeholder="영웅 소개를 입력하세요"
        />
      </div>
    </>
  )
}

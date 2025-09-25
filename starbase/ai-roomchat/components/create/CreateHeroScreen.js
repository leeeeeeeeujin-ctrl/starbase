'use client'

import { useRouter } from 'next/router'

import HeroAbilityFields from './HeroAbilityFields'
import HeroBackgroundUploadCard from './HeroBackgroundUploadCard'
import HeroBgmUploadCard from './HeroBgmUploadCard'
import HeroImageUploadCard from './HeroImageUploadCard'
import HeroInfoFields from './HeroInfoFields'
import { useHeroCreator } from './useHeroCreator'

export default function CreateHeroScreen() {
  const router = useRouter()
  const { state, actions } = useHeroCreator({ onSaved: () => router.replace('/roster') })

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        backgroundImage: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        color: '#fff',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '32px 16px 140px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(15, 23, 42, 0.4)',
              color: '#e2e8f0',
              fontWeight: 600,
              backdropFilter: 'blur(8px)',
            }}
          >
            ← 로스터로
          </button>
          <h1 style={{ margin: 0, fontSize: 24 }}>새 캐릭터 만들기</h1>
          <div style={{ width: 90 }} />
        </header>

        <section
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: 24,
            padding: '24px 20px 32px',
            boxShadow: '0 24px 60px -36px rgba(15, 23, 42, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <HeroImageUploadCard preview={state.preview} onSelect={actions.selectImage} />

          <div
            style={{
              display: 'grid',
              gap: 16,
              padding: '20px 16px',
              borderRadius: 24,
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
            }}
          >
            <HeroBackgroundUploadCard
              preview={state.backgroundPreview}
              error={state.backgroundError}
              onSelect={actions.selectBackground}
              onReset={actions.clearBackground}
            />

            <HeroBgmUploadCard
              label={state.bgmLabel}
              duration={state.bgmDuration}
              error={state.bgmError}
              onSelect={actions.selectBgm}
              onReset={actions.clearBgm}
            />
          </div>

          <HeroInfoFields
            name={state.name}
            description={state.description}
            onChangeName={actions.setName}
            onChangeDescription={actions.setDescription}
          />

          <HeroAbilityFields
            ability1={state.ability1}
            ability2={state.ability2}
            ability3={state.ability3}
            ability4={state.ability4}
            onChangeAbility1={actions.setAbility1}
            onChangeAbility2={actions.setAbility2}
            onChangeAbility3={actions.setAbility3}
            onChangeAbility4={actions.setAbility4}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
              marginTop: 12,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={actions.save}
              disabled={state.loading}
              style={{
                padding: '12px 32px',
                borderRadius: 999,
                border: 'none',
                background: state.loading ? 'rgba(148, 163, 184, 0.35)' : '#38bdf8',
                color: '#0f172a',
                fontWeight: 800,
                fontSize: 16,
                minWidth: 180,
                transition: 'transform 0.2s ease',
              }}
            >
              {state.loading ? '저장 중…' : '캐릭터 생성'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              style={{
                padding: '12px 28px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'transparent',
                color: '#cbd5f5',
                fontWeight: 600,
                minWidth: 150,
              }}
            >
              취소
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

//

// components/rank/RankNewClient.js
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { REALTIME_MODES } from '../../lib/rank/realtimeModes';
import PromptSetPicker from '../../components/rank/PromptSetPicker';
import SlotMatrix from '../../components/rank/SlotMatrix';
import RolesEditor from '../../components/rank/RolesEditor';
import RulesChecklist, { buildRulesPrefix } from '../../components/rank/RulesChecklist';
import { uploadGameImage } from '../../lib/rank/storage';
import { useSharedPromptSetStorage } from '../../hooks/shared/useSharedPromptSetStorage';
import RegistrationLayout from './registration/RegistrationLayout';
import RegistrationCard from './registration/RegistrationCard';
import SidebarCard from './registration/SidebarCard';
import {
  brawlModeCopy,
  imageFieldCopy,
  registrationOverviewCopy,
  realtimeModeCopy,
} from '../../data/rankRegistrationContent';
import { prepareRegistrationPayload } from '../../lib/rank/registrationValidation';
import { MATCH_MODE_KEYS } from '../../lib/rank/matchModes';

const MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;

const REALTIME_MODE_OPTIONS = (realtimeModeCopy?.options || []).map(option => ({
  value: REALTIME_MODES?.[option.value] ?? option.value,
  label: option.label,
}));

async function registerGame(payload) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const token = session?.access_token;

  if (sessionError || !token) {
    return { ok: false, error: '로그인이 필요합니다.' };
  }

  const prepared = prepareRegistrationPayload({ ...payload });
  if (!prepared.ok) {
    return { ok: false, error: prepared.error };
  }

  let response;
  try {
    response = await fetch('/api/rank/register-game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...prepared.game,
        roles: prepared.roles,
        slots: prepared.slots,
      }),
    });
  } catch (networkError) {
    console.warn('register-game request failed:', networkError);
    return { ok: false, error: '게임 등록 요청을 전송하지 못했습니다.' };
  }

  if (!response.ok) {
    try {
      const errorPayload = await response.json();
      return { ok: false, error: errorPayload?.error || '게임 등록에 실패했습니다.' };
    } catch (error) {
      return { ok: false, error: '게임 등록에 실패했습니다.' };
    }
  }

  const result = await response.json();
  if (!result?.ok) {
    return { ok: false, error: result?.error || '게임 등록에 실패했습니다.' };
  }

  return { ok: true, gameId: result.gameId };
}

export default function RankNewClient() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  // 기본 정보
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [imgFile, setImgFile] = useState(null);
  const [imgPreviewUrl, setImgPreviewUrl] = useState('');
  const [imgError, setImgError] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [setId, setSetId] = useState('');
  const [realtimeMode, setRealtimeMode] = useState(REALTIME_MODES.STANDARD);

  // 역할/슬롯
  const DEFAULT_ROLES = useMemo(
    () => [
      { name: '공격', score_delta_min: 20, score_delta_max: 40 },
      { name: '수비', score_delta_min: 20, score_delta_max: 40 },
    ],
    []
  );
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [slotMap, setSlotMap] = useState([]);

  // 규칙
  const [rules, setRules] = useState({
    nerf_insight: false,
    ban_kindness: false,
    nerf_peace: false,
    nerf_ultimate_injection: true,
    fair_power_balance: true,
    char_limit: 0,
  });
  const [brawlEnabled, setBrawlEnabled] = useState(false);
  const [endCondition, setEndCondition] = useState('');
  const [showBrawlHelp, setShowBrawlHelp] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitError, setSubmitError] = useState('');
  const [lastCreatedGame, setLastCreatedGame] = useState(null);
  const {
    backgroundUrl,
    promptSetId: sharedPromptSetId,
    setPromptSetId: setSharedPromptSetId,
  } = useSharedPromptSetStorage();

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive) return;
      if (!user) {
        router.replace('/');
        return;
      }
      setUser(user);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    if (sharedPromptSetId) {
      setSetId(sharedPromptSetId);
    }
  }, [sharedPromptSetId]);

  useEffect(() => {
    return () => {
      if (imgPreviewUrl) {
        URL.revokeObjectURL(imgPreviewUrl);
      }
    };
  }, [imgPreviewUrl]);

  const handlePromptSetChange = useCallback(
    value => {
      setSetId(value);
      setSharedPromptSetId(value);
    },
    [setSharedPromptSetId]
  );

  const handleClearImage = useCallback(() => {
    setImgFile(null);
    setImgError('');
    setImgPreviewUrl(prev => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return '';
    });
    setFileInputKey(prev => prev + 1);
  }, []);

  const handleImageChange = useCallback(
    event => {
      const file = event.target.files?.[0] || null;
      handleClearImage();

      if (!file) {
        return;
      }

      if (!file.type?.startsWith('image/')) {
        setImgError(imageFieldCopy.typeError);
        setFileInputKey(prev => prev + 1);
        return;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setImgError(imageFieldCopy.sizeError);
        setFileInputKey(prev => prev + 1);
        return;
      }

      const nextUrl = URL.createObjectURL(file);
      setImgFile(file);
      setImgPreviewUrl(nextUrl);
    },
    [handleClearImage]
  );

  const activeSlots = useMemo(
    () => (slotMap || []).filter(s => s.active && s.role && s.role.trim()),
    [slotMap]
  );

  const handleToggleBrawl = () => {
    setBrawlEnabled(prev => {
      const next = !prev;
      if (!next) {
        setShowBrawlHelp(false);
        setEndCondition('');
      }
      return next;
    });
  };

  const resetForm = useCallback(() => {
    setName('');
    setDesc('');
    handleClearImage();
    setSetId('');
    setSharedPromptSetId('');
    setRealtimeMode(REALTIME_MODES.STANDARD);
    setRoles(DEFAULT_ROLES);
    setSlotMap([]);
    setRules({
      nerf_insight: false,
      ban_kindness: false,
      nerf_peace: false,
      nerf_ultimate_injection: true,
      fair_power_balance: true,
      char_limit: 0,
    });
    setBrawlEnabled(false);
    setEndCondition('');
    setShowBrawlHelp(false);
    setSubmitStatus('idle');
    setSubmitError('');
  }, [DEFAULT_ROLES, handleClearImage, setSharedPromptSetId]);

  async function onSubmit() {
    if (submitStatus === 'submitting') {
      return;
    }
    if (!user) return alert('로그인이 필요합니다.');
    if (!setId) return alert('프롬프트 세트를 선택하세요.');
    if (activeSlots.length === 0) return alert('최소 1개의 슬롯을 활성화하고 역할을 지정하세요.');
    if (imgError) return alert(imgError);

    setSubmitStatus('submitting');
    setSubmitError('');

    let image_url = '';
    if (imgFile) {
      try {
        const up = await uploadGameImage(imgFile);
        image_url = up.url;
      } catch (e) {
        return alert('이미지 업로드 실패: ' + (e?.message || e));
      }
    }

    const trimmedEndCondition = endCondition.trim();
    if (brawlEnabled && !trimmedEndCondition) {
      return alert('난입 허용 시 종료 조건 변수를 입력해야 합니다.');
    }
    const compiledRules = {
      ...rules,
      brawl_rule: brawlEnabled ? 'allow-brawl' : 'banish-on-loss',
      end_condition_variable: brawlEnabled ? trimmedEndCondition || null : null,
    };

    const slotCountMap = activeSlots.reduce((acc, slot) => {
      const key = slot.role ? String(slot.role).trim() : '';
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const rolePayload = roles.map(role => {
      const name = role?.name ? String(role.name).trim() : '역할';
      const rawMin = Number(role?.score_delta_min);
      const rawMax = Number(role?.score_delta_max);
      const min = Number.isFinite(rawMin) ? rawMin : 20;
      const max = Number.isFinite(rawMax) ? rawMax : 40;
      const slotCount = Number.isFinite(Number(slotCountMap[name]))
        ? Number(slotCountMap[name])
        : 0;
      return {
        name,
        slot_count: Math.max(0, slotCount),
        score_delta_min: min,
        score_delta_max: max,
      };
    });

    const res = await registerGame({
      name: name || '새 게임',
      description: desc || '',
      image_url,
      prompt_set_id: setId,
      roles: rolePayload,
      rules: compiledRules,
      rules_prefix: buildRulesPrefix(compiledRules),
      realtime_match: realtimeMode,
      slots: slotMap,
    });

    if (!res.ok) {
      setSubmitStatus('idle');
      setSubmitError(res.error || '게임 등록에 실패했습니다.');
      return;
    }

    const gameId = res.gameId;
    const createdAt = new Date().toISOString();
    setLastCreatedGame({
      id: gameId,
      name: name || '새 게임',
      realtimeMode,
      createdAt,
    });
    setSubmitStatus('success');
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.55)',
    color: '#f8fafc',
  };

  const labelStyle = { display: 'grid', gap: 6, fontSize: 13 };

  const togglePillStyle = active => ({
    padding: '8px 18px',
    borderRadius: 999,
    border: active ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.45)',
    background: active ? 'rgba(96,165,250,0.25)' : 'rgba(15,23,42,0.55)',
    color: active ? '#0f172a' : '#f8fafc',
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: 'pointer',
  });

  const helperTextStyle = { fontSize: 12, color: '#94a3b8' };

  const moduleShellStyle = {
    background: 'rgba(15,23,42,0.45)',
    borderRadius: 16,
    padding: '12px 14px',
  };

  const sidebarCards = [
    <SidebarCard key="overview-checklist" title={registrationOverviewCopy.checklist.title}>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: '#cbd5f5' }}>
        {registrationOverviewCopy.checklist.items.map(item => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </SidebarCard>,
    <SidebarCard key="overview-guide" title={registrationOverviewCopy.guide.title}>
      <p style={{ margin: 0, color: '#cbd5f5' }}>{registrationOverviewCopy.guide.description}</p>
    </SidebarCard>,
    <SidebarCard key="realtime-helper" title={realtimeModeCopy.label}>
      <p style={{ margin: 0, color: '#bfdbfe' }}>{realtimeModeCopy.helper}</p>
    </SidebarCard>,
  ];

  const renderSuccessCard = () => {
    if (!lastCreatedGame) return null;

    const {
      id: gameId,
      name: gameName,
      realtimeMode: createdRealtimeMode,
      createdAt,
    } = lastCreatedGame;

    const realtimeSummaryLabel =
      REALTIME_MODE_OPTIONS.find(option => option.value === createdRealtimeMode)?.label ||
      '실시간 (표준)';

    const summaryLines = [`${gameName} (ID: ${gameId})`, `선택한 모드: ${realtimeSummaryLabel}`];

    const handleOpenHub = () => {
      router.push(`/rank/${gameId}`);
    };

    const handleOpenMatchReady = () => {
      router.push(`/rank/${gameId}/match-ready?mode=${MATCH_MODE_KEYS.RANK_SHARED}`);
    };

    const handleOpenSimulator = () => {
      router.push(`/rank/${gameId}/manual-console`);
    };

    const handleRegisterAnother = () => {
      setLastCreatedGame(null);
      resetForm();
    };

    return (
      <RegistrationCard
        key="registration-success"
        title="등록이 완료되었습니다"
        description={`테스트 전투나 매칭 준비를 바로 진행할 수 있습니다. (${new Date(
          createdAt
        ).toLocaleTimeString()})`}
      >
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, color: '#cbd5f5' }}>
          {summaryLines.map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
        <div
          style={{
            marginTop: 18,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={handleOpenHub}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              border: 'none',
              background: 'rgba(59,130,246,0.18)',
              color: '#dbeafe',
              fontWeight: 700,
            }}
          >
            허브에서 게임 열기
          </button>
          <button
            type="button"
            onClick={handleOpenMatchReady}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              border: 'none',
              background: 'rgba(34,197,94,0.18)',
              color: '#bbf7d0',
              fontWeight: 700,
            }}
          >
            매치 준비 화면 이동
          </button>
          <button
            type="button"
            onClick={handleOpenSimulator}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              border: 'none',
              background: 'rgba(251,191,36,0.18)',
              color: '#fef3c7',
              fontWeight: 700,
            }}
          >
            매치 시뮬레이터 열기
          </button>
          <button
            type="button"
            onClick={handleRegisterAnother}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.45)',
              background: 'transparent',
              color: '#cbd5f5',
              fontWeight: 600,
            }}
          >
            새 게임 계속 등록
          </button>
        </div>
      </RegistrationCard>
    );
  };

  return (
    <RegistrationLayout
      backgroundImage={backgroundUrl}
      title="게임 등록"
      subtitle="역할과 슬롯, 규칙을 채운 뒤 등록을 완료하세요."
      onBack={() => router.back()}
      sidebar={sidebarCards}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onSubmit}
            style={{
              padding: '12px 20px',
              borderRadius: 999,
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              color: '#fff',
              fontWeight: 700,
              boxShadow: '0 24px 60px -32px rgba(37, 99, 235, 0.65)',
            }}
            disabled={submitStatus === 'submitting'}
          >
            {submitStatus === 'submitting' ? '등록 중…' : '등록'}
          </button>
        </div>
      }
    >
      {submitError ? (
        <div
          style={{
            marginBottom: 12,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(248, 113, 113, 0.12)',
            color: '#fecaca',
            fontSize: 13,
          }}
        >
          {submitError}
        </div>
      ) : null}
      {renderSuccessCard()}
      <RegistrationCard
        title="기본 정보"
        description="게임 소개와 대표 이미지를 설정하세요."
        contentGap={14}
      >
        <label style={labelStyle}>
          <span style={{ color: '#cbd5f5' }}>게임 이름</span>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="예: 별빛 난투 시즌1"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={{ color: '#cbd5f5' }}>설명</span>
          <textarea
            placeholder="게임 소개와 매칭 규칙을 간단히 적어 주세요."
            rows={3}
            value={desc}
            onChange={event => setDesc(event.target.value)}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>
        <div style={moduleShellStyle}>
          <PromptSetPicker value={setId} onChange={handlePromptSetChange} />
        </div>
        <label style={labelStyle}>
          <span style={{ color: '#cbd5f5' }}>{imageFieldCopy.label}</span>
          <input
            type="file"
            accept="image/*"
            key={fileInputKey}
            onChange={handleImageChange}
            style={{ padding: '8px 0', color: '#f8fafc' }}
          />
          <span style={helperTextStyle}>{imageFieldCopy.sizeLimitNotice}</span>
          {imgError ? (
            <span style={{ ...helperTextStyle, color: '#fca5a5' }}>{imgError}</span>
          ) : null}
          {imgFile ? (
            <span style={helperTextStyle}>{imgFile.name}</span>
          ) : (
            <span style={helperTextStyle}>{imageFieldCopy.fallback}</span>
          )}
          {imgPreviewUrl ? (
            <div
              style={{
                display: 'grid',
                gap: 8,
                background: 'rgba(15,23,42,0.45)',
                borderRadius: 12,
                padding: 12,
                border: '1px solid rgba(148,163,184,0.35)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                  {imageFieldCopy.previewLabel}
                </span>
                <button
                  type="button"
                  onClick={handleClearImage}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#cbd5f5',
                    cursor: 'pointer',
                    fontSize: 12,
                    textDecoration: 'underline',
                  }}
                >
                  제거
                </button>
              </div>
              <img
                src={imgPreviewUrl}
                alt="선택한 표지 이미지 미리보기"
                style={{
                  width: '100%',
                  maxHeight: 200,
                  objectFit: 'cover',
                  borderRadius: 10,
                }}
              />
            </div>
          ) : null}
        </label>
      </RegistrationCard>

      <RegistrationCard
        title="모드 설정"
        description="실시간 여부와 난입 조건을 구성합니다."
        contentGap={16}
      >
        <label style={labelStyle}>
          <span style={{ color: '#cbd5f5' }}>{realtimeModeCopy.label}</span>
          <select
            value={realtimeMode}
            onChange={event => setRealtimeMode(event.target.value)}
            style={inputStyle}
          >
            {REALTIME_MODE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: '16px 18px',
            borderRadius: 18,
            border: '1px solid rgba(96,165,250,0.35)',
            background: 'rgba(30,64,175,0.28)',
            boxShadow: '0 16px 36px -28px rgba(37, 99, 235, 0.65)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'grid', gap: 4, minWidth: 240 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                {brawlModeCopy.title}
              </p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#dbeafe' }}>
                {brawlModeCopy.summary}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowBrawlHelp(prev => !prev)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: '1px solid rgba(148,163,184,0.45)',
                  background: 'rgba(15,23,42,0.55)',
                  color: '#f8fafc',
                  fontWeight: 700,
                }}
              >
                ?
              </button>
              <button
                type="button"
                style={togglePillStyle(brawlEnabled)}
                onClick={handleToggleBrawl}
              >
                {brawlEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {showBrawlHelp ? (
            <div
              style={{
                background: 'rgba(15,23,42,0.55)',
                borderRadius: 14,
                padding: '12px 14px',
                fontSize: 13,
                lineHeight: 1.6,
                color: '#e2e8f0',
              }}
            >
              {brawlModeCopy.tooltip}
            </div>
          ) : null}

          {brawlEnabled ? (
            <label style={labelStyle}>
              <span style={{ color: '#dbeafe' }}>{brawlModeCopy.endCondition.label}</span>
              <input
                type="text"
                value={endCondition}
                onChange={event => setEndCondition(event.target.value)}
                placeholder={brawlModeCopy.endCondition.placeholder}
                style={inputStyle}
              />
              <span style={{ fontSize: 12, color: '#bfdbfe' }}>
                {brawlModeCopy.endCondition.helper}
              </span>
            </label>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5' }}>{brawlModeCopy.offHint}</p>
          )}
        </div>
      </RegistrationCard>

      <RegistrationCard
        title="역할 정의"
        description="게임에서 사용할 역할과 점수 범위를 정리하세요."
      >
        <div style={moduleShellStyle}>
          <RolesEditor roles={roles} onChange={setRoles} />
        </div>
      </RegistrationCard>

      <RegistrationCard
        title="슬롯 매핑"
        description="역할과 슬롯을 연결해 매칭 시나리오를 구성합니다."
      >
        <div style={moduleShellStyle}>
          <SlotMatrix
            value={slotMap}
            onChange={setSlotMap}
            roleOptions={roles.map(role => role.name)}
          />
        </div>
      </RegistrationCard>

      <RegistrationCard
        title="체크리스트 · 세부 규칙"
        description="규칙을 검토하고 세부 설정을 마무리합니다."
      >
        <div style={moduleShellStyle}>
          <RulesChecklist value={rules} onChange={setRules} />
        </div>
      </RegistrationCard>
    </RegistrationLayout>
  );
}

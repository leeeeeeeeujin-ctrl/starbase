// components/rank/RankNewClient.js
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { REALTIME_MODES } from '../../lib/rank/realtimeModes';
import PromptSetPicker from '../../components/rank/PromptSetPicker';
import { uploadGameImage } from '../../lib/rank/storage';
import { useSharedPromptSetStorage } from '../../hooks/shared/useSharedPromptSetStorage';
import RegistrationLayout from './registration/RegistrationLayout';
import RegistrationCard from './registration/RegistrationCard';
import { imageFieldCopy } from '../../data/rankRegistrationContent';
import { prepareRegistrationPayload } from '../../lib/rank/registrationValidation';
import { useWorkspaceOptional } from '../workspace/CodeWorkspaceProvider.jsx';
import { MATCH_MODE_KEYS } from '../../lib/rank/matchModes';

const MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;

const REALTIME_MODE_OPTIONS = [
  { value: REALTIME_MODES.OFF, label: '비실시간' },
  { value: REALTIME_MODES.STANDARD, label: '실시간' },
];

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

  // 역할
  const DEFAULT_ROLES = useMemo(
    () => [
      { name: '공격', score_delta_min: 20, score_delta_max: 40 },
      { name: '수비', score_delta_min: 20, score_delta_max: 40 },
    ],
    []
  );
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitError, setSubmitError] = useState('');
  const [lastCreatedGame, setLastCreatedGame] = useState(null);
  const {
    backgroundUrl,
    promptSetId: sharedPromptSetId,
    setPromptSetId: setSharedPromptSetId,
  } = useSharedPromptSetStorage();
  const workspace = useWorkspaceOptional?.() || null;
  const makerBattleConfig = useMemo(() => {
    try {
      const templateText = workspace?.files?.['/template.json']?.content || '{}';
      const parsed = JSON.parse(templateText);
      const raw = parsed?.battleConfig || {};
      const maxPlayers = Number.isFinite(Number(raw.maxPlayers)) ? Number(raw.maxPlayers) : 2;
      const minPlayers = Number.isFinite(Number(raw.minPlayers)) ? Number(raw.minPlayers) : 1;
      const mode = String(raw.mode || '').trim() === 'multi' ? 'multi' : 'single';
      const roles = Array.isArray(raw.roles)
        ? raw.roles
            .map((role, index) => {
              const name = String(role?.name || role?.id || '').trim();
              if (!name) return null;
              return {
                id: String(role?.id || `role-${index + 1}`),
                name,
                team: String(role?.team || '').trim(),
                limit: Number.isFinite(Number(role?.limit)) ? Math.max(1, Number(role.limit)) : 1,
              };
            })
            .filter(Boolean)
        : [];
      return { mode, minPlayers, maxPlayers, roles };
    } catch {
      return { mode: 'single', minPlayers: 1, maxPlayers: 2, roles: [] };
    }
  }, [workspace?.files]);

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
    if (!Array.isArray(makerBattleConfig.roles) || makerBattleConfig.roles.length === 0) return;
    setRoles(
      makerBattleConfig.roles.map(role => ({
        name: role.name,
        score_delta_min: 20,
        score_delta_max: 40,
      }))
    );
  }, [makerBattleConfig]);

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

  const resetForm = useCallback(() => {
    setName('');
    setDesc('');
    handleClearImage();
    setSetId('');
    setSharedPromptSetId('');
    setRealtimeMode(REALTIME_MODES.STANDARD);
    setRoles(DEFAULT_ROLES);
    setSubmitStatus('idle');
    setSubmitError('');
  }, [DEFAULT_ROLES, handleClearImage, setSharedPromptSetId]);

  async function onSubmit() {
    if (submitStatus === 'submitting') {
      return;
    }
    if (!user) return alert('로그인이 필요합니다.');
    if (!setId) return alert('프롬프트 세트를 선택하세요.');
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

    const rolePayload = (makerBattleConfig.roles || []).map(role => ({
      name: role.name,
      slot_count: Number.isFinite(Number(role.limit)) ? Math.max(1, Number(role.limit)) : 1,
      score_delta_min: 20,
      score_delta_max: 40,
    }));

    const res = await registerGame({
      name: name || '새 게임',
      description: desc || '',
      image_url,
      prompt_set_id: setId,
      roles: rolePayload,
      rules: {},
      rules_prefix: '',
      realtime_match: realtimeMode,
      slots: [],
    });

    if (!res.ok) {
      setSubmitStatus('idle');
      setSubmitError(res.error || '게임 등록에 실패했습니다.');
      return;
    }

    const gameId = res.gameId;

    // 워크스페이스 스냅샷을 rank_game_workspaces에 저장한다 (best-effort).
    try {
      const {
        data: { session: snapSession },
      } = await supabase.auth.getSession();
      const snapToken = snapSession?.access_token;

      if (!snapToken) {
        throw new Error('missing_token_for_workspace_snapshot');
      }

      const files = workspace?.files || {};
      const templateText = files['/template.json']?.content || '{}';
      const graphText = files['/graph/prompt-graph.json']?.content || '{}';
      const runtimeConfigText = files['/game/runtime.config.json']?.content || '{}';
      const uiShellText = files['/game/ui.shell.json']?.content || '';
      const hooksSource = files['/game/hooks/automation.js']?.content || '';

      const workspacePayload = {
        template: JSON.parse(templateText || '{}'),
        graph: JSON.parse(graphText || '{}'),
        runtime_config: JSON.parse(runtimeConfigText || '{}'),
        hooks_source: hooksSource,
        ui_shell: uiShellText
          ? (() => {
              try {
                return JSON.parse(uiShellText);
              } catch {
                return null;
              }
            })()
          : null,
      };

      await fetch('/api/rank/save-game-workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${snapToken}`,
        },
        body: JSON.stringify({
          gameId,
          workspace: workspacePayload,
        }),
      }).catch(() => {});
    } catch {
      // 스냅샷 저장 실패는 게임 등록 자체를 막지 않는다.
    }
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
      subtitle="기본 정보와 실시간 여부를 정하고 메이커 역할 구성을 확인한 뒤 등록하세요."
      onBack={() => router.back()}
      sidebar={[]}
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
        description="매칭과 세션을 실시간으로 돌릴지 여부만 정합니다."
        contentGap={16}
      >
        <label style={labelStyle}>
          <span style={{ color: '#cbd5f5' }}>진행 방식</span>
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
        <div style={moduleShellStyle}>
          <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5', lineHeight: 1.7 }}>
            세부 규칙과 난입, 슬롯 구조는 이 화면에서 다루지 않습니다. 우선은 실시간 여부만 정하고,
            실제 역할/인원 구조는 메이커 설정을 기준으로 등록합니다.
          </p>
        </div>
      </RegistrationCard>

      <RegistrationCard
        title="역할 정의"
        description="역할과 인원 제한은 메이커에서 관리합니다."
      >
        <div style={moduleShellStyle}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#cbd5f5', lineHeight: 1.7 }}>
              이 페이지에서는 역할을 직접 편집하지 않습니다. 메이커의 게임 설정에서 최대 인원과 역할 구성을 저장하면, 등록은 그 구성을 기준으로 진행됩니다.
            </div>
            <div
              style={{
                display: 'grid',
                gap: 8,
                padding: '12px 14px',
                borderRadius: 14,
                background: 'rgba(15,23,42,0.55)',
                border: '1px solid rgba(148,163,184,0.35)',
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#bfdbfe' }}>
                <span>모드: {makerBattleConfig.mode === 'multi' ? '멀티' : '싱글'}</span>
                <span>인원: {makerBattleConfig.minPlayers} - {makerBattleConfig.maxPlayers}</span>
              </div>
              {makerBattleConfig.roles.length ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {makerBattleConfig.roles.map(role => (
                    <div
                      key={role.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '8px 10px',
                        borderRadius: 12,
                        background: 'rgba(30,41,59,0.9)',
                        color: '#e2e8f0',
                        fontSize: 12,
                      }}
                    >
                      <span>{role.name}</span>
                      <span>{role.team || '-'} / {role.limit}명</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  아직 메이커에 역할이 저장되지 않았습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </RegistrationCard>

    </RegistrationLayout>
  );
}

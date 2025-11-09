import { useCallback, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { uploadAsset } from '../../../utils/uploader';
import { withTable } from '../../../lib/supabaseTables';
import { sanitizeFileName } from '../../../utils/characterAssets';
import { clearHeroCache, writeHeroCache } from '../../../utils/heroCache';
import { showQuotaExceeded } from '../../../utils/quotaNotice';

export function useHeroPersistence({
  heroId,
  hero,
  edit,
  setHero,
  setEdit,
  background,
  bgm,
  onDeleted,
  router,
}) {
  const [saving, setSaving] = useState(false);
  const { backgroundBlob, onSaveComplete: completeBackgroundSave } = background;
  const { bgmBlob, bgmDuration, bgmMime, onSaveComplete: completeBgmSave } = bgm;

  const handleSave = useCallback(
    async nextEdit => {
      setSaving(true);
      try {
        const source = nextEdit || edit;
        const oldBackgroundUrl = hero?.background_url || null;
        const oldBgmUrl = hero?.bgm_url || null;

        let backgroundUrl = source.background_url || null;
        if (backgroundBlob) {
          const ext = (backgroundBlob.type && backgroundBlob.type.split('/')[1]) || 'jpg';
          const file = new File([backgroundBlob], `${sanitizeFileName(source.name || hero?.name || 'background')}.${ext}`, { type: backgroundBlob.type || 'image/jpeg' });
          const up = await uploadAsset(file, { gameId: 'heroes' });
          backgroundUrl = up.url;
        }

        let bgmUrl = source.bgm_url || null;
        let bgmDurationSeconds =
          bgmDuration != null ? bgmDuration : hero?.bgm_duration_seconds || null;
        let bgmMimeValue = bgmMime || hero?.bgm_mime || null;
        if (bgmBlob) {
          const ext = (bgmBlob.type && bgmBlob.type.split('/')[1]) || 'mp3';
          const file = new File([bgmBlob], `${sanitizeFileName(source.name || hero?.name || 'bgm')}.${ext}`, { type: bgmBlob.type || 'audio/mpeg' });
          const up = await uploadAsset(file, { gameId: 'heroes' });
          bgmUrl = up.url;
          bgmDurationSeconds = bgmDuration != null ? bgmDuration : bgmDurationSeconds;
          bgmMimeValue = bgmMime || bgmBlob.type || bgmMimeValue;
        }
        if (!bgmUrl) {
          bgmDurationSeconds = null;
          bgmMimeValue = null;
        }

        const payload = {
          name: source.name,
          description: source.description,
          ability1: source.ability1,
          ability2: source.ability2,
          ability3: source.ability3,
          ability4: source.ability4,
          background_url: backgroundUrl,
          bgm_url: bgmUrl,
          bgm_duration_seconds: bgmDurationSeconds,
          bgm_mime: bgmMimeValue,
        };

        const { error } = await withTable(supabase, 'heroes', table =>
          supabase.from(table).update(payload).eq('id', heroId)
        );
        if (error) throw error;

        const nextHero = {
          ...(hero || { id: heroId }),
          ...payload,
          id: heroId,
          background_url: backgroundUrl || '',
          bgm_url: bgmUrl || '',
          bgm_duration_seconds: bgmDurationSeconds || null,
          bgm_mime: bgmMimeValue || null,
        };

        setHero(prev => (prev ? { ...prev, ...nextHero } : nextHero));
        setEdit(prev => ({
          ...(prev || {}),
          name: payload.name,
          description: payload.description,
          ability1: payload.ability1,
          ability2: payload.ability2,
          ability3: payload.ability3,
          ability4: payload.ability4,
          background_url: backgroundUrl || '',
          bgm_url: bgmUrl || '',
        }));

        writeHeroCache(nextHero);

        completeBackgroundSave(backgroundUrl);
        completeBgmSave({ url: bgmUrl, duration: bgmDurationSeconds, mime: bgmMimeValue });

        // Best-effort cleanup: delete replaced assets from R2 after successful DB update
        try {
          const headers = await authHeader();
          const toDelete = [];
          if (oldBackgroundUrl && oldBackgroundUrl !== (backgroundUrl || '')) {
            toDelete.push(oldBackgroundUrl);
          }
          if (oldBgmUrl && oldBgmUrl !== (bgmUrl || '')) {
            toDelete.push(oldBgmUrl);
          }
          for (const url of toDelete) {
            await fetch('/api/storage/delete', {
              method: 'POST',
              headers: { 'content-type': 'application/json', ...(headers || {}) },
              body: JSON.stringify({ url }),
            }).catch(() => {});
          }
        } catch (cleanupError) {
          console.warn('[hero] cleanup skipped:', cleanupError);
        }

        alert('저장 완료');
      } catch (error) {
        const msg = String(error?.message || error || '').toLowerCase();
        if (msg.includes('quota')) {
          try { showQuotaExceeded(); } catch {}
        } else {
          alert(error.message || error);
        }
      } finally {
        setSaving(false);
      }
    },
    [
      backgroundBlob,
      completeBackgroundSave,
      completeBgmSave,
      edit,
      hero,
      heroId,
      setEdit,
      setHero,
      bgmBlob,
      bgmDuration,
      bgmMime,
    ]
  );

  const handleDelete = useCallback(async () => {
    if (!confirm('정말 삭제할까? 복구할 수 없습니다.')) return;
    const { error } = await withTable(supabase, 'heroes', table =>
      supabase.from(table).delete().eq('id', heroId)
    );
    if (error) {
      alert(error.message);
      return;
    }
    clearHeroCache(heroId);
    onDeleted?.();
    router.replace('/roster');
  }, [heroId, onDeleted, router]);

  return {
    saving,
    onSave: handleSave,
    onDelete: handleDelete,
  };
}

async function authHeader() {
  try {
    const { supabase } = await import('../../../lib/supabase');
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import { useMakerHome } from '../../../hooks/maker/useMakerHome';
import MakerHomeView from './MakerHomeView';
import { readHeroSelection } from '../../../lib/heroes/selectedHeroStorage';
import { useSharedPromptSetStorage } from '../../../hooks/shared/useSharedPromptSetStorage';
import DeleteSetDialog from './DeleteSetDialog';

export default function MakerHomeContainer() {
  const router = useRouter();
  const [returnHeroId, setReturnHeroId] = useState('');
  const { backgroundUrl, promptSetId, setPromptSetId } = useSharedPromptSetStorage();

  const handleUnauthorized = useCallback(() => {
    router.replace('/');
  }, [router]);

  const {
    hydrated,
    loading,
    errorMessage,
    noticeMessage,
    rows,
    refresh,
    renameSet,
    deleteSet,
    createSet,
    exportSet,
    importFromFile,
    setErrorMessage,
    setNoticeMessage,
  } = useMakerHome({ onUnauthorized: handleUnauthorized });

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [creatingSet, setCreatingSet] = useState(false);
  const [importingSet, setImportingSet] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '', busy: false, error: '', errorDetails: '' });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const selection = readHeroSelection();
    setReturnHeroId(selection?.heroId || '');
  }, []);

  const listHeader = useMemo(() => {
    if (loading) return '세트를 불러오는 중입니다.';
    if (rows.length === 0) return '아직 등록된 프롬프트 세트가 없습니다.';
    return `총 ${rows.length}개 세트`;
  }, [loading, rows]);

  const handleBeginRename = useCallback(row => {
    setEditingId(row.id);
    setEditingName(row.name ?? '');
  }, []);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditingName('');
    setSavingRename(false);
  }, []);

  const handleSubmitRename = useCallback(
    async event => {
      event.preventDefault();
      if (!editingId) return;

      try {
        setSavingRename(true);
        await renameSet(editingId, editingName);
        handleCancelRename();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : '세트 이름을 변경하지 못했습니다.');
      } finally {
        setSavingRename(false);
      }
    },
    [editingId, editingName, handleCancelRename, renameSet]
  );

  const handleDeleteSet = useCallback(
    id => {
      const row = (rows||[]).find(r => String(r.id) === String(id));
      setDeleteDialog({ open: true, id, name: row?.name || '', busy: false, error: '', errorDetails: '' });
    },
    [rows]
  );

  const confirmDelete = useCallback(async () => {
    const { id } = deleteDialog;
    if (!id) { setDeleteDialog(prev => ({ ...prev, open:false })); return; }
    setDeleteDialog(prev => ({ ...prev, busy: true, error: '', errorDetails: '' }));
    try {
      await deleteSet(id);
      // Clear shared selection if needed
      try { if (promptSetId && String(promptSetId) === String(id)) setPromptSetId(''); } catch {}
      setDeleteDialog({ open:false, id:null, name:'', busy:false, error:'', errorDetails:'' });
    } catch (err) {
      const now = new Date();
      const ts = isNaN(now.getTime()) ? '' : now.toISOString();
      const errName = err && err.name ? String(err.name) : '';
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err && err.stack ? String(err.stack) : '';
      const route = typeof window !== 'undefined' ? (window.location?.pathname || '') : '';
      const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
      const details = [
        `action: deleteSet`,
        `timestamp: ${ts}`,
        route ? `route: ${route}` : '',
        `setId: ${String(id)}`,
        `setName: ${String(deleteDialog?.name || '')}`,
        promptSetId ? `currentPromptSetId: ${String(promptSetId)}` : '',
        ua ? `userAgent: ${ua}` : '',
        errName ? `error.name: ${errName}` : '',
        errMsg ? `error.message: ${errMsg}` : '',
        errStack ? `error.stack:\n${errStack}` : '',
      ].filter(Boolean).join('\n');
      const msg = errMsg || '세트를 삭제하지 못했습니다.';
      setDeleteDialog(prev => ({ ...prev, busy:false, error: msg, errorDetails: details }));
    }
  }, [deleteDialog, deleteSet, promptSetId, setPromptSetId]);

  const cancelDelete = useCallback(() => {
    setDeleteDialog({ open:false, id:null, name:'', busy:false, error:'', errorDetails:'' });
  }, []);

  const handleCreateSet = useCallback(async () => {
    if (creatingSet || importingSet) return;
    try {
      setCreatingSet(true);
      const inserted = await createSet();
      setActionSheetOpen(false);
      if (inserted?.id) {
        setPromptSetId(inserted.id);
        router.push(`/maker/${inserted.id}`);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '세트를 생성하지 못했습니다.');
    } finally {
      setCreatingSet(false);
    }
  }, [createSet, creatingSet, importingSet, router, setPromptSetId]);

  const handleImportFile = useCallback(
    async file => {
      if (!file) return;
      if (creatingSet || importingSet) return;
      try {
        setImportingSet(true);
        const inserted = await importFromFile(file);
        setActionSheetOpen(false);
        if (inserted?.id) {
          setPromptSetId(inserted.id);
          router.push(`/maker/${inserted.id}`);
        }
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'JSON을 불러오지 못했습니다.');
      } finally {
        setImportingSet(false);
      }
    },
    [creatingSet, importingSet, importFromFile, router, setPromptSetId]
  );

  const handleExportSet = useCallback(
    async id => {
      try {
        setActionSheetOpen(false);
        await exportSet(id);
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : '세트를 내보내지 못했습니다.');
      }
    },
    [exportSet, setActionSheetOpen]
  );

  const handleRefresh = useCallback(() => {
    setErrorMessage('');
    setNoticeMessage('');
    refresh();
  }, [refresh, setErrorMessage, setNoticeMessage]);

  const handleGoBack = useCallback(() => {
    if (returnHeroId) {
      router.push(`/character/${returnHeroId}`);
    } else {
      router.push('/roster');
    }
  }, [returnHeroId, router]);

  if (!hydrated) {
    return null;
  }

  return (
    <>
      <MakerHomeView
        backgroundImage={backgroundUrl}
        listHeader={listHeader}
        errorMessage={errorMessage}
        noticeMessage={noticeMessage}
        loading={loading}
        rows={rows}
        editingId={editingId}
        editingName={editingName}
        savingRename={savingRename}
        actionSheetOpen={actionSheetOpen}
        actionBusy={creatingSet || importingSet}
        onEditingNameChange={setEditingName}
        onBeginRename={handleBeginRename}
        onSubmitRename={handleSubmitRename}
        onCancelRename={handleCancelRename}
        onDeleteSet={handleDeleteSet}
        onOpenSet={id => {
          setPromptSetId(id);
          router.push(`/maker/${id}`);
        }}
        onExportSet={handleExportSet}
        onImportFile={handleImportFile}
        onCreateSet={handleCreateSet}
        onRefresh={handleRefresh}
        onToggleActionSheet={setActionSheetOpen}
        onGoBack={handleGoBack}
      />
      <DeleteSetDialog
        open={deleteDialog.open}
        setName={deleteDialog.name}
        busy={deleteDialog.busy}
        error={deleteDialog.error}
        errorDetails={deleteDialog.errorDetails}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}

//

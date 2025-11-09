"use client";

import { useEffect } from 'react';
import { useWorkspaceSync } from '@/hooks/sync/useWorkspaceSync';

export default function WorkspaceSyncMount({ id }){
  useWorkspaceSync(String(id || ''));
  useEffect(() => { try { console.log('[WorkspaceSync] enabled for', id); } catch {} }, [id]);
  return null;
}


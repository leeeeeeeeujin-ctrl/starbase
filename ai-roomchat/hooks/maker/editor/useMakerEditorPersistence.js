'use client';

import { useCallback, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { sanitizeVariableRules } from '../../../lib/variableRules';

// NOTE:
// Maker 에디터 저장 경로에서는 Supabase JS 클라이언트를 직접 사용한다.
// withTableQuery 래퍼는 테스트/대체 스키마용으로 남겨두되,
// 실제 프롬프트 세트 편집에서는 prompt_slots / prompt_bridges 만 사용하므로
// 여기서는 명시적으로 해당 테이블을 호출해 네트워크 요청이 확실히 나가도록 고정한다.

export function useMakerEditorPersistence({ graph, setInfo, onAfterSave }) {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedEdge,
    flowMapRef,
    forgetFlowNode,
  } = graph;
  const [busy, setBusy] = useState(false);

  const removeEdge = useCallback(
    async edge => {
      if (!edge) return;
      setEdges(existing => existing.filter(item => item.id !== edge.id));
      setSelectedEdge(current => (current?.id === edge.id ? null : current));
      const bridgeId = edge?.data?.bridgeId;
      if (bridgeId) {
        await supabase.from('prompt_bridges').delete().eq('id', bridgeId);
      }
    },
    [setEdges, setSelectedEdge]
  );

  const handleDeletePrompt = useCallback(
    async flowNodeId => {
      setNodes(existing => existing.filter(node => node.id !== flowNodeId));

      const edgesToRemove = edges.filter(
        edge => edge.source === flowNodeId || edge.target === flowNodeId
      );
      if (edgesToRemove.length > 0) {
        setEdges(existing =>
          existing.filter(edge => edge.source !== flowNodeId && edge.target !== flowNodeId)
        );
      }

      setSelectedNodeId(current => (current === flowNodeId ? null : current));
      setSelectedEdge(current => {
        if (!current) return current;
        if (current.source === flowNodeId || current.target === flowNodeId) return null;
        return current;
      });

      const bridgeIds = edgesToRemove.map(edge => edge?.data?.bridgeId).filter(id => id);

      if (bridgeIds.length > 0) {
        await Promise.all(
          bridgeIds.map(id =>
            supabase.from('prompt_bridges').delete().eq('id', id)
          )
        );
      }

      const slotId = flowMapRef.current.get(flowNodeId);
      forgetFlowNode(flowNodeId);
      if (!slotId) return;

      await supabase
        .from('prompt_bridges')
        .delete()
        .or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`);

      await supabase.from('prompt_slots').delete().eq('id', slotId);
    },
    [edges, flowMapRef, forgetFlowNode, setEdges, setNodes, setSelectedEdge, setSelectedNodeId]
  );

  const onNodesDelete = useCallback(
    async deleted => {
      for (const node of deleted) {
        const slotId = flowMapRef.current.get(node.id);
        forgetFlowNode(node.id);
        if (!slotId) continue;
        await supabase
          .from('prompt_bridges')
          .delete()
          .or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`);
        await supabase.from('prompt_slots').delete().eq('id', slotId);
      }
    },
    [flowMapRef, forgetFlowNode]
  );

  const onEdgesDelete = useCallback(async deleted => {
    for (const edge of deleted) {
      const bridgeId = edge?.data?.bridgeId;
      if (bridgeId) {
        await supabase.from('prompt_bridges').delete().eq('id', bridgeId);
      }
    }
  }, []);

  const saveAll = useCallback(async () => {
    if (!setInfo || busy) return;

    try {
      console.log('[useMakerEditorPersistence] saveAll start', {
        setId: setInfo?.id,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes: nodes.map(n => ({
          id: n.id,
          slotNo: n.data?.slotNo,
          isStart: !!n.data?.isStart,
          template: n.data?.template?.substring(0, 50),
        })),
      });
    } catch {
      // ignore log errors
    }

    setBusy(true);
    try {
      const slotOrder = new Map();
      nodes.forEach((node, index) => {
        slotOrder.set(node.id, index + 1);
      });

      for (const node of nodes) {
        const slotNo = slotOrder.get(node.id) || 1;
        let slotId = flowMapRef.current.get(node.id);

        const payload = {
          set_id: setInfo.id,
          slot_no: slotNo,
          slot_type: node.data.slot_type || 'ai',
          slot_pick: node.data.slot_pick || '1',
          template: node.data.template || '',
          is_start: !!node.data.isStart,
          invisible: !!node.data.invisible,
          visible_slots: Array.isArray(node.data.visible_slots)
            ? node.data.visible_slots
                .map(value => Number(value))
                .filter(value => Number.isFinite(value))
            : [],
          canvas_x: typeof node.position?.x === 'number' ? node.position.x : null,
          canvas_y: typeof node.position?.y === 'number' ? node.position.y : null,
          var_rules_global: sanitizeVariableRules(node.data.var_rules_global),
          var_rules_local: sanitizeVariableRules(node.data.var_rules_local),
        };

        try {
          console.log('[useMakerEditorPersistence] upsert slot payload', {
            flowNodeId: node.id,
            existingSlotId: slotId,
            slotNo,
            isStart: !!payload.is_start,
            template: payload.template.substring(0, 80),
          });
        } catch {
          // ignore log errors
        }

        if (!slotId) {
          const { data: inserted, error } = await supabase
            .from('prompt_slots')
            .insert(payload)
            .select()
            .single();
          if (error || !inserted) {
            console.error(error);
            continue;
          }
          slotId = inserted.id;
          flowMapRef.current.set(node.id, slotId);
          try {
            console.log('[useMakerEditorPersistence] inserted new slot', {
              flowNodeId: node.id,
              slotId,
            });
          } catch {
            // ignore log errors
          }
        } else {
          await supabase.from('prompt_slots').update(payload).eq('id', slotId);
          try {
            console.log('[useMakerEditorPersistence] updated slot', {
              flowNodeId: node.id,
              slotId,
            });
          } catch {
            // ignore log errors
          }
        }
      }

      const { data: existingBridges } = await supabase
        .from('prompt_bridges')
        .select('id')
        .eq('from_set', setInfo.id);

      const keep = new Set();

      for (const edge of edges) {
        const fromSlot = flowMapRef.current.get(edge.source);
        const toSlot = flowMapRef.current.get(edge.target);
        if (!fromSlot || !toSlot) continue;

        const payload = {
          from_set: setInfo.id,
          from_slot_id: fromSlot,
          to_slot_id: toSlot,
          trigger_words: edge.data?.trigger_words || [],
          conditions: edge.data?.conditions || [],
          priority: edge.data?.priority ?? 0,
          probability: edge.data?.probability ?? 1,
          fallback: !!edge.data?.fallback,
          action: edge.data?.action || 'continue',
        };

        let bridgeId = edge.data?.bridgeId;
        if (!bridgeId) {
          const { data: inserted, error } = await supabase
            .from('prompt_bridges')
            .insert(payload)
            .select()
            .single();
          if (error || !inserted) {
            console.error(error);
            continue;
          }
          bridgeId = inserted.id;
          edge.data = { ...(edge.data || {}), bridgeId };
        } else {
          await supabase.from('prompt_bridges').update(payload).eq('id', bridgeId);
        }

        keep.add(bridgeId);
      }

      for (const bridge of existingBridges || []) {
        if (!keep.has(bridge.id)) {
          await supabase.from('prompt_bridges').delete().eq('id', bridge.id);
        }
      }

      try {
        console.log('[useMakerEditorPersistence] saveAll done', {
          setId: setInfo.id,
          slotCount: nodes.length,
          keptBridgeCount: keep.size,
        });
      } catch {
        // ignore log errors
      }

      setNodes(existing =>
        existing.map((node, index) => ({
          ...node,
          data: { ...node.data, slotNo: slotOrder.get(node.id) || index + 1 },
        }))
      );

      if (typeof onAfterSave === 'function') {
        onAfterSave();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, edges, flowMapRef, nodes, onAfterSave, setEdges, setNodes, setInfo]);

  return {
    busy,
    saveAll,
    handleDeletePrompt,
    onNodesDelete,
    onEdgesDelete,
    removeEdge,
  };
}

//

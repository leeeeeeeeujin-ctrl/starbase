'use client'

import { useCallback, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { sanitizeVariableRules } from '../../../lib/variableRules'

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
  } = graph
  const [busy, setBusy] = useState(false)

  const removeEdge = useCallback(
    async (edge) => {
      if (!edge) return
      setEdges((existing) => existing.filter((item) => item.id !== edge.id))
      setSelectedEdge((current) => (current?.id === edge.id ? null : current))
      const bridgeId = edge?.data?.bridgeId
      if (bridgeId) {
        await supabase.from('prompt_bridges').delete().eq('id', bridgeId)
      }
    },
    [setEdges, setSelectedEdge],
  )

  const handleDeletePrompt = useCallback(
    async (flowNodeId) => {
      setNodes((existing) => existing.filter((node) => node.id !== flowNodeId))

      const edgesToRemove = edges.filter(
        (edge) => edge.source === flowNodeId || edge.target === flowNodeId,
      )
      if (edgesToRemove.length > 0) {
        setEdges((existing) =>
          existing.filter((edge) => edge.source !== flowNodeId && edge.target !== flowNodeId),
        )
      }

      setSelectedNodeId((current) => (current === flowNodeId ? null : current))
      setSelectedEdge((current) => {
        if (!current) return current
        if (current.source === flowNodeId || current.target === flowNodeId) return null
        return current
      })

      const bridgeIds = edgesToRemove
        .map((edge) => edge?.data?.bridgeId)
        .filter((id) => id)

      if (bridgeIds.length > 0) {
        await Promise.all(
          bridgeIds.map((id) => supabase.from('prompt_bridges').delete().eq('id', id)),
        )
      }

      const slotId = flowMapRef.current.get(flowNodeId)
      forgetFlowNode(flowNodeId)
      if (!slotId) return

      await supabase
        .from('prompt_bridges')
        .delete()
        .or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)

      await supabase.from('prompt_slots').delete().eq('id', slotId)
    },
    [edges, flowMapRef, forgetFlowNode, setEdges, setNodes, setSelectedEdge, setSelectedNodeId],
  )

  const onNodesDelete = useCallback(
    async (deleted) => {
      for (const node of deleted) {
        const slotId = flowMapRef.current.get(node.id)
        forgetFlowNode(node.id)
        if (!slotId) continue
        await supabase
          .from('prompt_bridges')
          .delete()
          .or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
        await supabase.from('prompt_slots').delete().eq('id', slotId)
      }
    },
    [flowMapRef, forgetFlowNode],
  )

  const onEdgesDelete = useCallback(async (deleted) => {
    for (const edge of deleted) {
      const bridgeId = edge?.data?.bridgeId
      if (bridgeId) {
        await supabase.from('prompt_bridges').delete().eq('id', bridgeId)
      }
    }
  }, [])

  const saveAll = useCallback(async () => {
    if (!setInfo || busy) return

    setBusy(true)
    try {
      const slotOrder = new Map()
      nodes.forEach((node, index) => {
        slotOrder.set(node.id, index + 1)
      })

      for (const node of nodes) {
        const slotNo = slotOrder.get(node.id) || 1
        let slotId = flowMapRef.current.get(node.id)

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
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
            : [],
          canvas_x: typeof node.position?.x === 'number' ? node.position.x : null,
          canvas_y: typeof node.position?.y === 'number' ? node.position.y : null,
          var_rules_global: sanitizeVariableRules(node.data.var_rules_global),
          var_rules_local: sanitizeVariableRules(node.data.var_rules_local),
        }

        if (!slotId) {
          const { data: inserted, error } = await supabase
            .from('prompt_slots')
            .insert(payload)
            .select()
            .single()
          if (error || !inserted) {
            console.error(error)
            continue
          }
          slotId = inserted.id
          flowMapRef.current.set(node.id, slotId)
        } else {
          await supabase.from('prompt_slots').update(payload).eq('id', slotId)
        }
      }

      const { data: existingBridges } = await supabase
        .from('prompt_bridges')
        .select('id')
        .eq('from_set', setInfo.id)

      const keep = new Set()

      for (const edge of edges) {
        const fromSlot = flowMapRef.current.get(edge.source)
        const toSlot = flowMapRef.current.get(edge.target)
        if (!fromSlot || !toSlot) continue

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
        }

        let bridgeId = edge.data?.bridgeId
        if (!bridgeId) {
          const { data: inserted, error } = await supabase
            .from('prompt_bridges')
            .insert(payload)
            .select()
            .single()
          if (error || !inserted) {
            console.error(error)
            continue
          }
          bridgeId = inserted.id
          edge.data = { ...(edge.data || {}), bridgeId }
        } else {
          await supabase.from('prompt_bridges').update(payload).eq('id', bridgeId)
        }

        keep.add(bridgeId)
      }

      for (const bridge of existingBridges || []) {
        if (!keep.has(bridge.id)) {
          await supabase.from('prompt_bridges').delete().eq('id', bridge.id)
        }
      }

      setNodes((existing) =>
        existing.map((node, index) => ({
          ...node,
          data: { ...node.data, slotNo: slotOrder.get(node.id) || index + 1 },
        })),
      )

      if (typeof onAfterSave === 'function') {
        onAfterSave()
      }
    } finally {
      setBusy(false)
    }
  }, [busy, edges, flowMapRef, nodes, onAfterSave, setEdges, setNodes, setInfo])

  return {
    busy,
    saveAll,
    handleDeletePrompt,
    onNodesDelete,
    onEdgesDelete,
    removeEdge,
  }
}

//

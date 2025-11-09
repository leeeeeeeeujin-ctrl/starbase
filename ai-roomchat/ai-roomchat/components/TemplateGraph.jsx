"use client";
import React, { useMemo } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";

export default function TemplateGraph({ template }) {
  const { nodes, edges } = useMemo(() => {
    const t = template || {};
    const ns = Array.isArray(t.nodes) ? t.nodes : [];
    const es = Array.isArray(t.edges) ? t.edges : [];
    const grid = 180;
    const flowNodes = ns.map((n, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = (n.x ?? col * grid);
      const y = (n.y ?? row * grid);
      return {
        id: String(n.id || i),
        position: { x, y },
        data: { label: `${n.name || n.id} (${n.type})` },
      };
    });
    const flowEdges = es.map((e, i) => ({
      id: `e-${e.from}-${e.to}-${i}`,
      source: String(e.from),
      target: String(e.to),
      label: e.mapping && e.mapping.branch ? e.mapping.branch : undefined,
    }));
    return { nodes: flowNodes, edges: flowEdges };
  }, [template]);

  return (
    <div style={{ height: 260, border: "1px solid #eee", borderRadius: 4 }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <MiniMap zoomable pannable />
        <Controls />
        <Background gap={16} color="#eaeaea" />
      </ReactFlow>
    </div>
  );
}


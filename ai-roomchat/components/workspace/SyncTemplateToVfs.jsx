"use client";

import React, { useEffect, useRef } from 'react';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';

function InnerSync({ text, setText }){
  const { files, writeFile } = useWorkspace();
  const current = files['/template.json']?.content ?? '';
  const prevRef = useRef({ text, current });

  useEffect(() => {
    const prev = prevRef.current;
    const textChanged = text !== prev.text;
    const currentChanged = current !== prev.current;
    prevRef.current = { text, current };

    try {
      // 변경이 없으면 아무 것도 하지 않음
      if (!textChanged && !currentChanged) return;

      // 템플릿(text)만 바뀐 경우: Studio/Maker 쪽에서 수정 → VFS로 반영
      if (textChanged && !currentChanged && typeof text === 'string') {
        writeFile('/template.json', text);
        try {
          const obj = JSON.parse(text || '{}');
          const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
          const edges = Array.isArray(obj.edges) ? obj.edges : [];
          const g = {
            // 템플릿 노드의 data.template(프롬프트 본문)를 우선 label로 투영하고,
            // 나머지 필드는 그대로 유지해 런타임에서 참조할 수 있게 둔다.
            nodes: nodes.map((n) => {
              const data = n && typeof n.data === 'object' ? n.data : {};
              const label =
                (typeof data.template === 'string' && data.template.length
                  ? data.template
                  : null) ||
                (typeof data.name === 'string' && data.name.length ? data.name : null) ||
                (typeof n.label === 'string' && n.label.length ? n.label : '');
              return {
                id: n.id,
                type: n.type || 'prompt',
                label,
                data,
              };
            }),
            edges: edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              label: e.label || '',
            })),
          };
          writeFile('/graph/prompt-graph.json', JSON.stringify(g, null, 2) + '\n');
        } catch {
          // 템플릿이 JSON이 아니어도 에디터는 계속 동작해야 하므로 무시
        }
        return;
      }

      // VFS(current)만 바뀐 경우: 워크스페이스(모나코)에서 수정 → 템플릿으로 반영
      if (currentChanged && !textChanged && typeof current === 'string' && typeof setText === 'function') {
        setText(current);
        return;
      }

      // 둘 다 동시에 바뀐 경우에는 보수적으로 아무 것도 하지 않음
    } catch {
      // 동기화 실패는 편집 자체를 막지 않도록 무시
    }
  }, [text, current, writeFile, setText]);
  return null;
}

class WorkspaceBoundary extends React.Component {
  constructor(props){ super(props); this.state={ hasError:false }; }
  static getDerivedStateFromError(){ return { hasError:true }; }
  componentDidCatch(err){ try{ console.warn('[SyncTemplateToVfs] workspace unavailable', err?.message||err); }catch{} }
  render(){ return this.state.hasError ? null : this.props.children; }
}

export default function SyncTemplateToVfs(props){
  return (
    <WorkspaceBoundary>
      <InnerSync {...props} />
    </WorkspaceBoundary>
  );
}

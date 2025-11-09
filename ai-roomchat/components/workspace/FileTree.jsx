"use client";

import React, { useMemo } from "react";

function buildTree(files) {
  const root = { name: '/', path: '/', children: [], dir: true };
  Object.keys(files || {}).forEach((p) => {
    const clean = String(p || '').replace(/^\/+/, '');
    const parts = clean === '' ? [] : clean.split('/');
    let node = root;
    parts.forEach((part, idx) => {
      const path = '/' + parts.slice(0, idx + 1).join('/');
      let child = node.children.find((c) => c.path === path);
      if (!child) {
        child = { name: part, path, children: [], dir: /\/$/.test(path) };
        node.children.push(child);
      }
      node = child;
    });
  });
  // sort children
  function sortNode(n) {
    if (!n.children) return;
    n.children.sort((a, b) => {
      const ad = a.children && a.children.length ? 0 : 1;
      const bd = b.children && b.children.length ? 0 : 1;
      if (ad !== bd) return ad - bd;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortNode);
  }
  sortNode(root);
  return root.children;
}

function NodeRow({ node, depth = 0, selected, onOpen }) {
  const pad = { paddingLeft: 8 + depth * 12 };
  return (
    <li key={node.path} style={{ listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={pad}>
          <button onClick={() => onOpen(node.path)} style={{ all: 'unset', cursor: 'pointer' }}>
            {node.name}
          </button>
        </div>
      </div>
      {node.children && node.children.length ? (
        <ul style={{ margin: 0, padding: 0 }}>
          {node.children.map((c) => (
            <NodeRow key={c.path} node={c} depth={depth + 1} selected={selected} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function FileTree({ files = {}, root = "/", selected = null, onOpen = () => {} }) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <div>
      <ul style={{ margin: 0, paddingLeft: 0 }}>
        {tree.map((n) => (
          <NodeRow key={n.path} node={n} depth={0} selected={selected} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

export function FileTreeSmall(props) {
  return <FileTree {...props} />;
}


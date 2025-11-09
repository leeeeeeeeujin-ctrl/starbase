
"use client";

import React from "react";
import { useWorkspace } from "./CodeWorkspaceProvider.jsx";

function joinPath(parent, name) {
	if (!parent) return `/${name}`;
	const p = parent.endsWith('/') ? parent.slice(0, -1) : parent;
	return `${p}/${name}`;
}

function FileNode({ path, name, meta, onOpen, onToggle, isOpen }) {
	const isDir = meta && meta.dir;
	return (
		<div style={{ paddingLeft: 8, display: 'flex', alignItems: 'center' }}>
			{isDir ? (
				<button onClick={() => onToggle(path)} aria-label={isOpen ? 'close' : 'open'}>
					{isOpen ? '▾' : '▸'}
				</button>
			) : (
				<span style={{ width: 16 }} />
			)}
			<div style={{ marginLeft: 6, cursor: isDir ? 'pointer' : 'default' }} onDoubleClick={() => !isDir && onOpen(path)}>
				{name}
			</div>
		</div>
	);
}

export default function FileTree({ root = '/', onSelect }) {
	const ws = useWorkspace();
	const { files, openPaths, open, close, open: openFile } = ws;

	// build a hierarchical tree from files map
	const tree = React.useMemo(() => {
		const nodes = {};
		Object.keys(files || {}).forEach((p) => {
			const parts = p.split('/').filter(Boolean);
			let cur = nodes;
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (!cur[part]) cur[part] = { __meta: null, __children: {} };
				if (i === parts.length - 1) {
					cur[part].__meta = files[p];
				}
				cur = cur[part].__children;
			}
		});
		return nodes;
	}, [files]);

	function renderTree(nodes, parentPath = '') {
		return Object.keys(nodes).sort().map((key) => {
			const node = nodes[key];
			const nodePath = joinPath(parentPath, key);
			const isOpen = openPaths.includes(nodePath) || node.__meta?.dir;
			return (
				<div key={nodePath}>
					<FileNode
						path={nodePath}
						name={key}
						meta={node.__meta || { dir: true }}
						onOpen={(p) => { openFile(p); if (onSelect) onSelect(p); }}
						onToggle={(p) => { if (openPaths.includes(p)) close(p); else open(p); }}
						isOpen={isOpen}
					/>
					{isOpen ? <div style={{ marginLeft: 12 }}>{renderTree(node.__children, nodePath)}</div> : null}
				</div>
			);
		});
	}

	return <div role="tree">{renderTree(tree, root)}</div>;
}

export function FileTreeSmall(props) {
	return <FileTree {...props} />;
}


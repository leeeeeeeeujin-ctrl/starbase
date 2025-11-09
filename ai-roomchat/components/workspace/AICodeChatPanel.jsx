
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "./CodeWorkspaceProvider.jsx";
import { useDebouncedCallback } from "../../hooks/useDebounce.js";
import { apiFetch } from "../../lib/fetcher.js";

function ActionList({ actions = [], onApply }) {
	return (
		<div>
			{actions.map((a, i) => (
				<div key={i} style={{ borderBottom: '1px solid #eee', padding: 8 }}>
					<div style={{ fontWeight: 'bold' }}>{a.type}</div>
					<pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(a, null, 2)}</pre>
					<button onClick={() => onApply(a)}>Apply</button>
				</div>
			))}
		</div>
	);
}

export default function AICodeChatPanel({ initialThread = null }) {
	const ws = useWorkspace();
	const [messages, setMessages] = useState(initialThread ? initialThread.messages || [] : []);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [actions, setActions] = useState([]);
	const abortRef = useRef(null);

	const sendMessage = async (text) => {
		setLoading(true);
		try {
			const body = { input: text, context: { files: Object.keys(ws.files || {}) } };
			const res = await apiFetch('/api/ai/gemini', { method: 'POST', body: JSON.stringify(body) });
			const data = await res.json();
			const msgs = data.messages || [];
			setMessages((m) => [...m, ...msgs]);
			// parse actions if present
			const parsed = data.actions || [];
			setActions(parsed);
		} catch (err) {
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	const applyAction = async (action) => {
		// action types: create/write/delete/rename
		try {
			if (action.type === 'create' || action.type === 'write') {
				await ws.writeFile(action.path, action.content || '');
				ws.saveFile(action.path);
			} else if (action.type === 'delete') {
				ws.remove(action.path);
			} else if (action.type === 'rename') {
				ws.rename(action.path, action.newPath);
			}
		} catch (err) {
			console.error('applyAction', err);
		}
	};

	return (
		<div style={{ padding: 12 }}>
			<div style={{ marginBottom: 8 }}>
				<strong>AI Code Chat</strong>
			</div>
			<div style={{ marginBottom: 8 }}>
				<div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #eee', padding: 8 }}>
					{messages.map((m, i) => (
						<div key={i} style={{ marginBottom: 8 }}>
							<div style={{ fontSize: 12, color: '#666' }}>{m.role}</div>
							<div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
						</div>
					))}
				</div>
			</div>
			<div style={{ display: 'flex', gap: 8 }}>
				<input value={input} onChange={(e) => setInput(e.target.value)} style={{ flex: 1 }} />
				<button onClick={() => { sendMessage(input); setInput(''); }} disabled={loading}>Send</button>
			</div>
			<div style={{ marginTop: 12 }}>
				<strong>Suggested Actions</strong>
				<ActionList actions={actions} onApply={applyAction} />
			</div>
		</div>
	);
}

export function AICodeChatPanelMini(props) {
	return <AICodeChatPanel {...props} />;
}


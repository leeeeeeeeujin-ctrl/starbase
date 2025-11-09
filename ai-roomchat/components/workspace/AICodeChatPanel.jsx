
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
		if (!text) return;
		setLoading(true);
		try {
			const body = { input: text, context: { files: Object.keys(ws.files || {}) } };
			const res = await apiFetch('/api/ai/gemini', { method: 'POST', body: JSON.stringify(body) });
			const data = await (res && res.json ? res.json() : Promise.resolve({}));
			const textOut = data?.output || data?.text || JSON.stringify(data);
			setMessages((m) => [...m, { role: 'assistant', content: textOut }]);
			if (Array.isArray(data?.actions)) setActions(data.actions);
		} catch (err) {
			console.warn('AICodeChatPanel sendMessage error', err);
		} finally {
			setLoading(false);
		}
	};

	const applyAction = (a) => {
		if (!a || !a.type) return;
		try {
			if (a.type === 'write' && a.path) ws.writeFile(a.path, a.content || '');
			if (a.type === 'create' && a.path) ws.createFile(a.path, a.content || '');
			if (a.type === 'delete' && a.path) ws.remove(a.path);
		} catch (e) { console.warn(e); }
	};

	const debouncedSend = useDebouncedCallback((v) => sendMessage(v), 150);

	useEffect(() => {
		return () => {
			if (abortRef.current && typeof abortRef.current.abort === 'function') abortRef.current.abort();
		};
	}, []);

	return (
		<div style={{ padding: 8 }}>
			<div style={{ display: 'flex', gap: 8 }}>
				<input
					placeholder="Ask AI to edit files or explain"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					style={{ flex: 1 }}
				/>
				<button onClick={async () => { await sendMessage(input); }}>{loading ? 'Running…' : 'Run'}</button>
			</div>
			<div style={{ marginTop: 8 }}>
				{messages.map((m, i) => (
					<div key={i} style={{ padding: 6, border: '1px solid #eee', marginBottom: 6 }}>
						<strong>{m.role}</strong>
						<pre style={{ whiteSpace: 'pre-wrap' }}>{m.content}</pre>
					</div>
				))}
			</div>
			{actions.length > 0 && (
				<div style={{ marginTop: 8 }}>
					<h4>Actions</h4>
					<ActionList actions={actions} onApply={applyAction} />
				</div>
			)}
		</div>
	);
}

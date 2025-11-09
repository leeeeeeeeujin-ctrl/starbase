
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
			"use client";

			import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
			import { useSession } from "../../lib/auth/useSession.js";
			import { useWorkspace } from "./CodeWorkspaceProvider.jsx";
			import { installPromptCreationGuard } from "../../lib/prompts/installPromptCreationGuard.js";

			export default function AICodeChatPanel({ setId, template }) {
				const session = useSession();
				const ws = useWorkspace();
				const [messages, setMessages] = useState([]);
				const [isRunning, setIsRunning] = useState(false);
				const [apiKey, setApiKey] = useState(null);
				const runningRef = useRef(false);

				useEffect(() => {
					try { installPromptCreationGuard(); } catch {}
				}, []);

				const systemPrompt = useMemo(() => {
					return [
						{ role: 'system', content: 'You are an AI coding assistant for an in-browser workspace.' },
						{ role: 'system', content: 'When asked to edit files, respond with JSON: { actions: [{ type: "write", path, content }] }' }
					];
				}, []);

				const sendPlan = useCallback(async (plan) => {
					// plan: { message?, actions? }
					try {
						const res = await fetch('/api/prompts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ setId, plan }) });
						if (!res.ok) throw new Error('failed');
						const j = await res.json();
						return j;
					} catch (err) { console.warn(err); return null; }
				}, [setId]);

				const handleThink = useCallback(async (promptText) => {
					if (!promptText) return;
					setIsRunning(true); runningRef.current = true;
					setMessages((m) => [...m, { role: 'user', content: promptText }]);
					try {
						const body = { messages: [...systemPrompt, { role: 'user', content: promptText }], maxTokens: 1024 };
						const res = await fetch('/api/ai/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
						const j = await res.json();
						const text = j?.choices?.[0]?.message?.content || j?.output || '';
						setMessages((m) => [...m, { role: 'assistant', content: text }]);
						// parse JSON plan
						try {
							const plan = JSON.parse(text);
							if (plan?.actions && Array.isArray(plan.actions)) {
								// apply actions safely
								for (const a of plan.actions) {
									if (a.type === 'write' && a.path) {
										ws.writeFile(a.path, a.content || '');
									}
									if (a.type === 'create' && a.path) {
										ws.createFile(a.path, a.content || '');
									}
									if (a.type === 'delete' && a.path) {
										ws.remove(a.path);
									}
								}
								// send plan to server to persist
								"use client";

								import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
								import { useSession } from "../../lib/auth/useSession.js";
								import { useWorkspace } from "./CodeWorkspaceProvider.jsx";
								import { installPromptCreationGuard } from "../../lib/prompts/installPromptCreationGuard.js";

								export default function AICodeChatPanel({ setId, template }) {
									const session = useSession();
									const ws = useWorkspace();
									const [messages, setMessages] = useState([]);
									const [isRunning, setIsRunning] = useState(false);
									const [apiKey, setApiKey] = useState(null);
									const runningRef = useRef(false);

									useEffect(() => {
										try { installPromptCreationGuard(); } catch {}
									}, []);

									const systemPrompt = useMemo(() => {
										return [
											{ role: 'system', content: 'You are an AI coding assistant for an in-browser workspace.' },
											{ role: 'system', content: 'When asked to edit files, respond with JSON: { actions: [{ type: "write", path, content }] }' }
										];
									}, []);

									const sendPlan = useCallback(async (plan) => {
										// plan: { message?, actions? }
										try {
											const res = await fetch('/api/prompts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ setId, plan }) });
											if (!res.ok) throw new Error('failed');
											const j = await res.json();
											return j;
										} catch (err) { console.warn(err); return null; }
									}, [setId]);

									const handleThink = useCallback(async (promptText) => {
										if (!promptText) return;
										setIsRunning(true); runningRef.current = true;
										setMessages((m) => [...m, { role: 'user', content: promptText }]);
										try {
											const body = { messages: [...systemPrompt, { role: 'user', content: promptText }], maxTokens: 1024 };
											const res = await fetch('/api/ai/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
											const j = await res.json();
											const text = j?.choices?.[0]?.message?.content || j?.output || '';
											setMessages((m) => [...m, { role: 'assistant', content: text }]);
											// parse JSON plan
											try {
												const plan = JSON.parse(text);
												if (plan?.actions && Array.isArray(plan.actions)) {
													// apply actions safely
													for (const a of plan.actions) {
														if (a.type === 'write' && a.path) {
															ws.writeFile(a.path, a.content || '');
														}
														if (a.type === 'create' && a.path) {
															ws.createFile(a.path, a.content || '');
														}
														if (a.type === 'delete' && a.path) {
															ws.remove(a.path);
														}
													}
													// send plan to server to persist
													await sendPlan(plan);
												}
											} catch (err) { console.warn('plan parse failed', err); }
										} catch (err) { console.warn(err); }
										setIsRunning(false); runningRef.current = false;
									}, [systemPrompt, sendPlan, ws]);

									return (
										<div style={{ padding: 8 }}>
											<div style={{ display: 'flex', gap: 8 }}>
												<input placeholder="Ask AI to edit files or explain" style={{ flex: 1 }} id="ai_prompt_input" />
												<button onClick={async () => { const v = document.getElementById('ai_prompt_input').value; await handleThink(v); }}>Run</button>
											</div>
											<div style={{ marginTop: 8 }}>
												{messages.map((m, i) => (
													<div key={i} style={{ padding: 6, border: '1px solid #eee', marginBottom: 6 }}>
														<strong>{m.role}</strong>
														<pre style={{ whiteSpace: 'pre-wrap' }}>{m.content}</pre>
													</div>
												))}
											</div>
										</div>
									);
								}


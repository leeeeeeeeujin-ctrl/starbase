import { useEffect, useMemo, useState } from "react";
import { loadTemplate, saveTemplate, importFromFile, exportToFile } from "../lib/templateStore";
import { validateTemplate } from "../lib/validator";
import { createRunner } from "../lib/runners";
import dynamic from "next/dynamic";
const TemplateGraph = dynamic(() => import("./TemplateGraph"), { ssr: false });
const MonacoJsonEditor = dynamic(() => import("./MonacoJsonEditor"), { ssr: false });

const STORAGE_KEY = "template:current";

export default function TemplateStudio() {
  const [text, setText] = useState("");
  const [template, setTemplate] = useState(null);
  const [vars, setVars] = useState({});
  const [result, setResult] = useState(null);
  const [endpointUrl, setEndpointUrl] = useState("/api/run-template");
  const [runnerKind, setRunnerKind] = useState("mock"); // mock | proxy | cli
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const saved = loadTemplate(STORAGE_KEY);
    if (saved) {
      try { setText(JSON.stringify(saved, null, 2)); } catch {}
    } else {
      fetch("/templates/basic-game.json")
        .then(r => r.ok ? r.json() : null)
        .then((t) => t && setText(JSON.stringify(t, null, 2)))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    try {
      const t = JSON.parse(text || "null");
      setTemplate(t);
      const v = { ...(t?.variables || {}) };
      if (v.branch === undefined) v.branch = "left";
      setVars(v);
      saveTemplate(STORAGE_KEY, t);
    } catch {
      setTemplate(null);
    }
  }, [text]);

  const validation = useMemo(() => validateTemplate(template), [template]);

  function onVarChange(k, v) {
    setVars((s) => ({ ...s, [k]: v }));
  }

  async function runMock() {
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    const runner = createRunner("mock");
    const r = await runner.run(template, vars);
    setResult(r);
  }

  async function runProxy() {
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    const endpoint = endpointUrl || "/api/run-template";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, variables: vars })
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
    setResult(data);
  }

  async function runCli() {
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    const runner = createRunner("cli", { endpoint: endpointUrl || "http://127.0.0.1:4311/run-template" });
    const r = await runner.run(template, vars);
    setResult(r);
  }

  async function runUnified() {
    if (runnerKind === "mock") return runMock();
    if (runnerKind === "proxy") return runProxy();
    if (runnerKind === "cli") return runCli();
  }

  async function onImport(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const t = await importFromFile(f);
      setText(JSON.stringify(t, null, 2));
    } catch {}
  }

  function onExport() {
    exportToFile(`${template?.id || "template"}.json`, text);
  }

  const variableKeys = Object.keys(vars || {});

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
          <label style={{ cursor: "pointer" }}>
            <input type="file" accept="application/json" onChange={onImport} style={{ display: "none" }} />
            <span style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4 }}>Import</span>
          </label>
          <button onClick={onExport} style={{ padding: "6px 10px" }}>Export</button>
          <select value={runnerKind} onChange={(e) => setRunnerKind(e.target.value)} style={{ padding: 6, border: "1px solid #ddd", borderRadius: 4 }}>
            <option value="mock">Mock</option>
            <option value="proxy">Proxy (Next API)</option>
            <option value="cli">CLI Bridge</option>
          </select>
          <button onClick={runUnified} style={{ padding: "6px 10px" }}>Run</button>
          <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="Endpoint URL" title="Proxy or CLI endpoint" style={{ flex: 1, padding: 6, border: "1px solid #ddd", borderRadius: 4 }} />
        </div>
        <MonacoJsonEditor value={text} onChange={setText} height={360} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <section style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "4px 0" }}>Variables</h3>
          {variableKeys.length === 0 && <div style={{ color: "#888" }}>No variables</div>}
          {variableKeys.map((k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 100, color: "#555" }}>{k}</div>
              <input
                value={String(vars[k] ?? "")}
                onChange={(e) => onVarChange(k, e.target.value)}
                style={{ flex: 1, padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
              />
            </div>
          ))}
        </section>
        <section style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "4px 0" }}>Validation</h3>
          {validation.ok ? (
            <div style={{ color: "#0a0" }}>Valid</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {validation.errors.map((e, i) => (
                <li key={i} style={{ color: "#a00" }}>{e}</li>
              ))}
            </ul>
          )}
        </section>
        <section style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "4px 0" }}>Graph</h3>
          {template ? <TemplateGraph template={template} /> : <div style={{ color: "#888" }}>No template</div>}
        </section>
        <section style={{ flex: 1, overflow: "auto" }}>
          <h3 style={{ margin: "4px 0" }}>Run Result</h3>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", border: "1px solid #eee", borderRadius: 4, padding: 8, background: "#fafafa" }}>
            {result ? JSON.stringify(result, null, 2) : "No run yet"}
          </pre>
        </section>
        <section style={{ marginTop: 12 }}>
          <h3 style={{ margin: "4px 0" }}>Timeline</h3>
          {result && Array.isArray(result.logs) && result.logs.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.logs.map((log, i) => (
                <li key={i} style={{ color: "#333" }}>
                  {log.type === "prompt" && (<span>[{log.node}] {String(log.text).slice(0, 120)}</span>)}
                  {log.type === "decision" && (<span>[{log.node}] branch → {String(log.branch)}</span>)}
                  {log.type === "tool" && (<span>[{log.node}] tool status: {String(log.status || 'ok')}</span>)}
                  {log.type === "end" && (<span>[{log.node}] end</span>)}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: "#888" }}>No logs</div>
          )}
        </section>
      </div>
    </div>
  );
}

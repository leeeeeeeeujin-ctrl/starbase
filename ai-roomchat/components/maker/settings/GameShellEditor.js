"use client";

import { useEffect, useMemo, useState } from "react";

function parseTemplate(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function extractShell(templateObj) {
  const shell =
    templateObj && typeof templateObj.ui_shell === "object"
      ? { ...templateObj.ui_shell }
      : {};
  const panels =
    shell.panels && typeof shell.panels === "object" ? { ...shell.panels } : {};
  const widgets =
    panels.widgets && typeof panels.widgets === "object"
      ? { ...panels.widgets }
      : {};
  const turnLogBar =
    panels.turnLogBar && typeof panels.turnLogBar === "object"
      ? { ...panels.turnLogBar }
      : {};

  const widgetsEnabled = widgets.enabled !== false;
  const turnLogBarEnabled = !!turnLogBar.enabled;

  return {
    shell,
    widgets,
    turnLogBar,
    widgetsEnabled,
    turnLogBarEnabled,
  };
}

export default function GameShellEditor({
  visible,
  onClose,
  templateText,
  setTemplateText,
}) {
  const [widgetsEnabled, setWidgetsEnabled] = useState(true);
  const [turnLogBarEnabled, setTurnLogBarEnabled] = useState(false);
  const [widgetRows, setWidgetRows] = useState([]);

  const parsed = useMemo(() => parseTemplate(templateText), [templateText]);

  useEffect(() => {
    if (!visible) return;
    const { widgetsEnabled: w, turnLogBarEnabled: t, widgets } = extractShell(parsed);
    setWidgetsEnabled(w);
    setTurnLogBarEnabled(t);
    const list = Array.isArray(widgets.widgets) ? widgets.widgets : [];
    setWidgetRows(
      list.map((w, index) => ({
        key: w.key || `w-${index}`,
        kind: w.kind || "",
        title: w.title || "",
        source: w.source || "",
        raw: { ...w },
      }))
    );
  }, [visible, parsed]);

  if (!visible) return null;

  const handleSave = () => {
    try {
      const base = parseTemplate(templateText);
      const { shell, widgets, turnLogBar } = extractShell(base);
      const nextShell = { ...shell };
      const panels =
        nextShell.panels && typeof nextShell.panels === "object"
          ? { ...nextShell.panels }
          : {};

      const nextWidgets = { ...widgets, enabled: widgetsEnabled };
      // widgetRows 를 기반으로 widgets.widgets 재구성
      nextWidgets.widgets = widgetRows.map((row, index) => {
        const raw = row.raw && typeof row.raw === "object" ? { ...row.raw } : {};
        const styleFromRow = {};
        if (row.stylePadding) styleFromRow.padding = row.stylePadding;
        if (row.styleRadius) styleFromRow.radius = row.styleRadius;
        if (row.styleTone) styleFromRow.tone = row.styleTone;
        if (row.styleDensity) styleFromRow.density = row.styleDensity;
        const mergedStyle =
          Object.keys(styleFromRow).length > 0
            ? { ...(raw.style || {}), ...styleFromRow }
            : raw.style || undefined;
        return {
          ...raw,
          kind: row.kind || raw.kind || "chatLog",
          title: row.title || raw.title || "",
          source: row.source || raw.source || "",
          key: row.key || raw.key || `w-${index}`,
          ...(mergedStyle ? { style: mergedStyle } : {}),
        };
      });
      const nextTurnLog = { ...turnLogBar, enabled: turnLogBarEnabled };

      panels.widgets = nextWidgets;
      panels.turnLogBar = nextTurnLog;
      nextShell.panels = panels;

      const next = { ...base, ui_shell: nextShell };
      if (typeof setTemplateText === "function") {
        setTemplateText(JSON.stringify(next, null, 2));
      }
    } catch (e) {
      // Best-effort only; keep errors local
      try {
        console.error("GameShellEditor save failed:", e);
      } catch {}
    }

    try {
      onClose && onClose();
    } catch {}
  };

  const handleCancel = () => {
    try {
      onClose && onClose();
    } catch {}
  };

  const rawShellJson = useMemo(() => {
    try {
      const shell =
        parsed && typeof parsed.ui_shell === "object" ? parsed.ui_shell : {};
      return JSON.stringify(shell, null, 2);
    } catch {
      return "{}";
    }
  }, [parsed]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1650,
        background: "rgba(2,6,23,0.65)",
      }}
    >
      <div
        onClick={handleCancel}
        style={{ position: "absolute", inset: 0 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: "env(safe-area-inset-left)",
          right: "env(safe-area-inset-right)",
          bottom: "env(safe-area-inset-bottom)",
          top: "min(8%, 64px)",
          margin: "auto",
          maxWidth: 640,
          background: "#0b1220",
          border: "1px solid rgba(148,163,184,0.35)",
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #25314a",
            color: "#e2e8f0",
            fontWeight: 700,
          }}
        >
          게임 셸 설정
        </div>
        <div
          style={{
            padding: 12,
            display: "grid",
            gap: 12,
            overflow: "auto",
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, color: "#cbd5e1" }}>패널</div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#e2e8f0",
              }}
            >
              <input
                type="checkbox"
                checked={widgetsEnabled}
                onChange={(e) => setWidgetsEnabled(!!e.target.checked)}
              />
              widgets 패널 활성화 (Shell 위젯 영역)
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#e2e8f0",
              }}
            >
              <input
                type="checkbox"
                checked={turnLogBarEnabled}
                onChange={(e) => setTurnLogBarEnabled(!!e.target.checked)}
              />
              하단 턴 로그 바 활성화
            </label>
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
              }}
            >
              이 설정은 `/game/ui.shell.json` 계약을 미리보기용으로 템플릿에
              저장합니다. 앞으로 workspace 기반 게임에서는 같은 스키마를 그대로
              사용합니다.
            </div>
          </div>

          <div
            style={{
              height: 1,
              background: "rgba(148,163,184,0.25)",
              margin: "4px 0",
            }}
          />

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, color: "#cbd5e1" }}>위젯 목록</div>
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
              }}
            >
              여기에서 Shell widgets 패널에 배치할 위젯들을 간단히 정의할 수 있습니다.
              kind / title / source 필드만 편집하며, 나머지 세부 옵션은 필요할 때
              JSON에서 직접 다듬을 수 있습니다.
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {widgetRows.map((row, index) => (
                <div
                  key={row.key || index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr) minmax(0, 1.2fr) auto",
                    gap: 6,
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <select
                    value={row.kind || ""}
                    onChange={(e) => {
                      const next = [...widgetRows];
                      next[index] = { ...next[index], kind: e.target.value };
                      setWidgetRows(next);
                    }}
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid rgba(148,163,184,0.6)",
                      background: "#020617",
                      color: "#e5e7eb",
                    }}
                  >
                    <option value="">(kind)</option>
                    <option value="chatLog">chatLog</option>
                    <option value="heroCard">heroCard</option>
                    <option value="badge">badge</option>
                    <option value="textBlock">textBlock</option>
                    <option value="image">image</option>
                    <option value="statMeter">statMeter</option>
                  </select>
                  <input
                    type="text"
                    placeholder="title"
                    value={row.title || ""}
                    onChange={(e) => {
                      const next = [...widgetRows];
                      next[index] = { ...next[index], title: e.target.value };
                      setWidgetRows(next);
                    }}
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid rgba(148,163,184,0.6)",
                      background: "#020617",
                      color: "#e5e7eb",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="source (예: rank.viewer, variables.battleLast.narrative)"
                    value={row.source || ""}
                    onChange={(e) => {
                      const next = [...widgetRows];
                      next[index] = { ...next[index], source: e.target.value };
                      setWidgetRows(next);
                    }}
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid rgba(148,163,184,0.6)",
                      background: "#020617",
                      color: "#e5e7eb",
                    }}
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: 6,
                      fontSize: 11,
                      color: "#cbd5e1",
                    }}
                  >
                    <select
                      value={row.stylePadding || row.raw?.style?.padding || ""}
                      onChange={(e) => {
                        const next = [...widgetRows];
                        next[index] = {
                          ...next[index],
                          stylePadding: e.target.value || "",
                        };
                        setWidgetRows(next);
                      }}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid rgba(148,163,184,0.6)",
                        background: "#020617",
                        color: "#e5e7eb",
                      }}
                    >
                      <option value="">padding</option>
                      <option value="xs">xs</option>
                      <option value="sm">sm</option>
                      <option value="md">md</option>
                      <option value="lg">lg</option>
                    </select>
                    <select
                      value={row.styleRadius || row.raw?.style?.radius || ""}
                      onChange={(e) => {
                        const next = [...widgetRows];
                        next[index] = {
                          ...next[index],
                          styleRadius: e.target.value || "",
                        };
                        setWidgetRows(next);
                      }}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid rgba(148,163,184,0.6)",
                        background: "#020617",
                        color: "#e5e7eb",
                      }}
                    >
                      <option value="">radius</option>
                      <option value="sm">sm</option>
                      <option value="md">md</option>
                      <option value="lg">lg</option>
                      <option value="full">full</option>
                    </select>
                    <select
                      value={row.styleTone || row.raw?.style?.tone || ""}
                      onChange={(e) => {
                        const next = [...widgetRows];
                        next[index] = {
                          ...next[index],
                          styleTone: e.target.value || "",
                        };
                        setWidgetRows(next);
                      }}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid rgba(148,163,184,0.6)",
                        background: "#020617",
                        color: "#e5e7eb",
                      }}
                    >
                      <option value="">tone</option>
                      <option value="primary">primary</option>
                      <option value="secondary">secondary</option>
                      <option value="muted">muted</option>
                      <option value="danger">danger</option>
                    </select>
                    <select
                      value={row.styleDensity || row.raw?.style?.density || ""}
                      onChange={(e) => {
                        const next = [...widgetRows];
                        next[index] = {
                          ...next[index],
                          styleDensity: e.target.value || "",
                        };
                        setWidgetRows(next);
                      }}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid rgba(148,163,184,0.6)",
                        background: "#020617",
                        color: "#e5e7eb",
                      }}
                    >
                      <option value="">density</option>
                      <option value="compact">compact</option>
                      <option value="normal">normal</option>
                      <option value="relaxed">relaxed</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = widgetRows.filter((_, i) => i !== index);
                      setWidgetRows(next);
                    }}
                    style={{
                      padding: "4px 6px",
                      borderRadius: 6,
                      border: "1px solid rgba(127,29,29,0.8)",
                      background: "rgba(30,7,7,0.9)",
                      color: "#fecaca",
                      fontSize: 11,
                    }}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setWidgetRows((prev) => [
                  ...prev,
                  {
                    key: `w-${Date.now()}-${prev.length}`,
                    kind: "chatLog",
                    title: "",
                    source: "",
                    raw: {},
                  },
                ]);
              }}
              style={{
                marginTop: 4,
                alignSelf: "flex-start",
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(37,99,235,0.7)",
                background: "rgba(15,23,42,0.95)",
                color: "#bfdbfe",
                fontSize: 12,
              }}
            >
              + 위젯 추가
            </button>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 13, color: "#cbd5e1" }}>현재 셸 스냅샷</div>
            <textarea
              readOnly
              value={rawShellJson}
              style={{
                width: "100%",
                minHeight: 140,
                padding: 8,
                borderRadius: 8,
                border: "1px solid rgba(30,64,175,0.6)",
                background: "#020617",
                color: "#e5e7eb",
                fontSize: 11,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
              }}
            />
          </div>
        </div>
        <div
          style={{
            padding: 12,
            borderTop: "1px solid #25314a",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#0b1220",
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #2563eb",
              background: "#1d4ed8",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

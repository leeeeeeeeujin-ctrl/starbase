"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspace } from "../../workspace/CodeWorkspaceProvider.jsx";
import { loadRolesConfig } from "../../../lib/rank/rolesConfig.js";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.75)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
};

const panelStyle = {
  width: "min(720px, 96vw)",
  maxHeight: "80vh",
  background: "#020617",
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.55)",
  boxShadow: "0 24px 60px rgba(15,23,42,0.8)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  color: "#e2e8f0",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const listStyle = {
  flex: "1 1 auto",
  overflowY: "auto",
  padding: "4px 2px",
  display: "grid",
  gap: 8,
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(120px,1.2fr) minmax(60px,0.7fr) minmax(80px,0.8fr) minmax(80px,0.8fr) auto",
  gap: 8,
  alignItems: "center",
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(15,23,42,0.65)",
  border: "1px solid rgba(30,64,175,0.7)",
};

const labelStyle = {
  fontSize: 12,
  color: "#cbd5e1",
  marginBottom: 4,
};

const inputStyle = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.6)",
  background: "#020617",
  color: "#e2e8f0",
  fontSize: 12,
};

const smallBtn = {
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.7)",
  background: "rgba(15,23,42,0.9)",
  color: "#e2e8f0",
  fontSize: 11,
  fontWeight: 600,
};

export default function RolesRankEditor({ visible, onClose }) {
  const workspace = useWorkspace();
  const files = workspace?.files || {};
  const write = workspace?.write;

  const [roles, setRoles] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!visible) return;
    try {
      const cfg = loadRolesConfig(files, "/game/roles.rank.json");
      setRoles(cfg.roles || []);
      setDirty(false);
    } catch {
      setRoles([]);
      setDirty(false);
    }
  }, [visible, files]);

  const ensureRole = useCallback((role) => {
    return {
      name: String(role?.name || "").trim(),
      slotCount: Number.isFinite(Number(role?.slotCount)) ? Number(role.slotCount) : 0,
      scoreDeltaMin: Number.isFinite(Number(role?.scoreDeltaMin)) ? Number(role.scoreDeltaMin) : 0,
      scoreDeltaMax: Number.isFinite(Number(role?.scoreDeltaMax)) ? Number(role.scoreDeltaMax) : 0,
      active: role?.active !== false,
    };
  }, []);

  const updateRole = (index, patch) => {
    setRoles((prev) => {
      const next = [...prev];
      const merged = { ...(next[index] || {}), ...patch };
      next[index] = merged;
      return next;
    });
    setDirty(true);
  };

  const addRole = () => {
    setRoles((prev) => [
      ...prev,
      {
        name: "",
        slotCount: 1,
        scoreDeltaMin: 0,
        scoreDeltaMax: 40,
        active: true,
      },
    ]);
    setDirty(true);
  };

  const removeRole = (index) => {
    setRoles((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!write) {
      if (onClose) onClose();
      return;
    }
    const normalized = roles.map(ensureRole);
    const payload = { roles: normalized };
    const json = JSON.stringify(payload, null, 2) + "\n";
    try {
      await write("/game/roles.rank.json", json);
      setDirty(false);
      if (onClose) onClose();
    } catch (e) {
      try {
        alert("역할/점수 설정을 저장하지 못했습니다.");
      } catch {}
    }
  };

  if (!visible) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <strong style={{ fontSize: 15 }}>역할 / 점수 설정 (/game/roles.rank.json)</strong>
            <span style={{ fontSize: 12, color: "#cbd5e1" }}>
              랭크 게임에서 사용할 역할 이름, 슬롯 수, 점수 범위를 정의합니다. 프롬프트‑노드 에디터와 코드 에디터가 함께 참조하는 공통 설정입니다.
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={addRole}
              style={{ ...smallBtn, background: "rgba(22,163,74,0.2)", borderColor: "#22c55e" }}
            >
              + 역할 추가
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ ...smallBtn, background: "rgba(15,23,42,0.85)" }}
            >
              닫기
            </button>
          </div>
        </div>

        <div style={listStyle}>
          {roles.length === 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: "rgba(15,23,42,0.7)",
                border: "1px dashed rgba(148,163,184,0.6)",
                fontSize: 12,
                color: "#cbd5e1",
              }}
            >
              아직 정의된 역할이 없습니다.{" "}
              <span style={{ color: "#bfdbfe", fontWeight: 600 }}>“+ 역할 추가”</span> 버튼을 눌러 역할과 점수 범위를 설정하세요.
            </div>
          ) : (
            roles.map((role, index) => (
              <div key={index} style={rowStyle}>
                <div>
                  <div style={labelStyle}>역할 이름</div>
                  <input
                    type="text"
                    value={role.name || ""}
                    onChange={(e) => updateRole(index, { name: e.target.value })}
                    placeholder="예: 공격수, 지원가"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={labelStyle}>슬롯 수</div>
                  <input
                    type="number"
                    value={role.slotCount ?? ""}
                    onChange={(e) =>
                      updateRole(index, { slotCount: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0 })
                    }
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={labelStyle}>점수 최소값</div>
                  <input
                    type="number"
                    value={role.scoreDeltaMin ?? ""}
                    onChange={(e) =>
                      updateRole(index, {
                        scoreDeltaMin: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0,
                      })
                    }
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={labelStyle}>점수 최대값</div>
                  <input
                    type="number"
                    value={role.scoreDeltaMax ?? ""}
                    onChange={(e) =>
                      updateRole(index, {
                        scoreDeltaMax: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0,
                      })
                    }
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      color: "#cbd5e1",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={role.active !== false}
                      onChange={(e) => updateRole(index, { active: !!e.target.checked })}
                    />{" "}
                    활성
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRole(index)}
                    style={{ ...smallBtn, borderColor: "#f97373", color: "#fecaca" }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            이 설정은 추후 랭크 등록 및 게임 런타임에서 공통으로 사용되며, 워크스페이스 파일로 함께 저장됩니다.
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            style={{
              ...smallBtn,
              padding: "7px 14px",
              background: dirty ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" : "rgba(15,23,42,0.8)",
              borderColor: dirty ? "#4ade80" : "rgba(148,163,184,0.7)",
              color: dirty ? "#f9fafb" : "#cbd5e1",
              opacity: dirty ? 1 : 0.7,
            }}
          >
            💾 설정 저장
          </button>
        </div>
      </div>
    </div>
  );
}


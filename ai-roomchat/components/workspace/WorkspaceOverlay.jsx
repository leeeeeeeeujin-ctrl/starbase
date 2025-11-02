"use client";

import { useMemo } from "react";
import { CodeWorkspaceProvider, useWorkspace } from "./CodeWorkspaceProvider.jsx";
import FileTree from "./FileTree.jsx";
import EditorMonaco from "../EditorMonaco.jsx";

function EditorPane() {
  const { files, activePath, writeFile, inferLang } = useWorkspace();
  const file = files[activePath];
  const lang = useMemo(() => inferLang(activePath), [activePath, inferLang]);
  if (!file) return <div style={{ padding: 16, color: "#e2e8f0" }}>파일을 선택하세요.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "6px 10px", borderBottom: "1px solid #25314a", color: "#e2e8f0" }}>
        <strong>{activePath}</strong>
        {file.readonly && (
          <span style={{ marginLeft: 8, fontSize: 12, color: "#94a3b8" }}>(읽기 전용)</span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorMonaco
          value={file.content}
          onChange={(val) => !file.readonly && writeFile(activePath, val)}
          language={lang}
          theme="vs-dark"
          height="100%"
        />
      </div>
    </div>
  );
}

export default function WorkspaceOverlay() {
  return (
    <CodeWorkspaceProvider>
      <div style={{ display: "flex", height: "100%", background: "#0b1220" }}>
        <FileTree />
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditorPane />
        </div>
      </div>
    </CodeWorkspaceProvider>
  );
}


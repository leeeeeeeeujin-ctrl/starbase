import dynamic from "next/dynamic";
import { useState } from "react";

const TemplateStudio = dynamic(() => import("../components/TemplateStudio"), { ssr: false });
const EditorMonaco = dynamic(() => import("../components/EditorMonaco"), { ssr: false });

export default function StudioPage() {
  const [tab, setTab] = useState("template");
  return (
    <div style={{ height: "100vh", padding: 12, boxSizing: "border-box", display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h2 style={{ margin: 0, marginRight: 12 }}>Studio</h2>
        <button onClick={() => setTab('template')} disabled={tab==='template'}>Template</button>
        <button onClick={() => setTab('editor')} disabled={tab==='editor'}>Editor</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'template' ? <TemplateStudio /> : <EditorMonaco />}
      </div>
    </div>
  );
}

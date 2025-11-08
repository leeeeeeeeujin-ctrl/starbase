/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import GameRealtimeRuntime from '../../../../components/game/GameRealtimeRuntime.jsx';
import { CodeWorkspaceProvider, useWorkspace } from '../../../../components/workspace/CodeWorkspaceProvider.jsx';
import { useGameRuntime } from '../../../../components/game/GameRuntimeProvider.jsx';

function Probe({ cb }) {
  const api = useGameRuntime();
  React.useEffect(() => { if (api?.graph && cb) cb(api.graph); }, [api?.graph]);
  return null;
}

describe('GameRealtimeRuntime graph derivation from dirty template', () => {
  test('derives graph when template is dirty and graph file missing', async () => {
    let captured = null;
    const TemplateSetter = () => {
      const { writeFile } = useWorkspace();
      React.useEffect(() => {
        const tpl = {
          nodes: [
            { id: 'n1', type: 'system', label: '시작' },
            { id: 'n2', type: 'ai', label: '질문' }
          ],
            edges: [ { id:'e1', source:'n1', target:'n2', label:'' } ]
        };
        writeFile('/template.json', JSON.stringify(tpl, null, 2)+'\n');
      }, [writeFile]);
      return null;
    };
    let renderer;
    await act(async () => {
      renderer = create(
        <CodeWorkspaceProvider>
          <TemplateSetter />
          <GameRealtimeRuntime roomId="local-test" />
          <Probe cb={(g)=>{ captured = g; }} />
        </CodeWorkspaceProvider>
      );
      await Promise.resolve();
    });
    // allow effects to run
    await act(async () => { await Promise.resolve(); });
    expect(captured).toBeTruthy();
    expect(Array.isArray(captured.nodes)).toBe(true);
    expect(captured.nodes.find(n => n.id === 'n1')).toBeTruthy();
    expect(captured.edges.find(e => e.id === 'e1')).toBeTruthy();
  });
});

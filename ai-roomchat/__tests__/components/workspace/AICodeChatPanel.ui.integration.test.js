/**
 * @jest-environment jsdom
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import AICodeChatPanel from '../../../../components/workspace/AICodeChatPanel.jsx';
import { CodeWorkspaceProvider } from '../../../../components/workspace/CodeWorkspaceProvider.jsx';

function Wrapper({ children }){
  return <CodeWorkspaceProvider>{children}</CodeWorkspaceProvider>;
}

describe('AICodeChatPanel UI builder integration', () => {
  test('menu contains UI builder items', async () => {
    let renderer;
    await act(async () => {
      renderer = create(
        <Wrapper>
          <AICodeChatPanel />
        </Wrapper>
      );
      await Promise.resolve();
    });
    const root = renderer.root;

    // open actions menu (⋮)
    const buttons = root.findAll(n => n.type === 'button' && (n.props.title === '옵션' || n.props.children === '⋮'));
    expect(buttons.length).toBeGreaterThan(0);
    await act(async () => { buttons[0].props.onClick(); await Promise.resolve(); });

    const uiPresetBtns = root.findAll(n => n.type === 'button' && typeof n.props.children === 'string' && n.props.children.includes('UI 제작(메인 기본)'));
    const imageUiBtns = root.findAll(n => n.type === 'button' && typeof n.props.children === 'string' && n.props.children.includes('이미지로 UI 생성'));
    expect(uiPresetBtns.length).toBeGreaterThan(0);
    expect(imageUiBtns.length).toBeGreaterThan(0);
  });
});

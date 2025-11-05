/**
 * @jest-environment jsdom
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import WorkspaceOverlay from '../../../../components/workspace/WorkspaceOverlay.jsx';

// Mock dynamic imports used inside WorkspaceOverlay (MainGameMobileUI)
jest.mock('../../../../components/game/MainGameMobileUI.jsx', () => () => null);

// Mock next/dynamic to return the component directly
jest.mock('next/dynamic', () => (loader) => loader);

// Silence window.location.href changes in test
const originalLocation = window.location;
beforeAll(() => {
  delete window.location;
  window.location = { href: '', assign: jest.fn(), replace: jest.fn() };
});
afterAll(() => {
  window.location = originalLocation;
});

describe('WorkspaceOverlay Tools menu', () => {
  test('shows Tools dropdown with Prompt Editor entry', async () => {
    let renderer;
    await act(async () => {
      renderer = create(<WorkspaceOverlay />);
      await Promise.resolve();
    });
    const root = renderer.root;

    // Find the "도구" button
    const toolButtons = root.findAll(
      node => node.type === 'button' && node.props && node.props.title === '도구' || node.props.children === '도구'
    );
    expect(toolButtons.length).toBeGreaterThan(0);

    // Click to open dropdown
    await act(async () => {
      toolButtons[0].props.onClick();
      await Promise.resolve();
    });

    // Check for prompt editor entry in dropdown
    const openPromptEditor = root.findAll(
      n => n.type === 'button' && n.props && n.props['data-test-id'] === 'open-prompt-editor'
    );
    expect(openPromptEditor.length).toBeGreaterThan(0);
  });
});

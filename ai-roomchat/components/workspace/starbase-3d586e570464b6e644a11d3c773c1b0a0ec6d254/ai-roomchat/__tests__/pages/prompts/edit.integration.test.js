/**
 * @jest-environment jsdom
 */

import React from 'react';
import { act, create } from 'react-test-renderer';

// Mock next/router to provide query param id
jest.mock('next/router', () => ({
  useRouter: () => ({ query: { id: 'example-1' }, replace: jest.fn() }),
}));

import PromptEditPage from '../../../pages/prompts/[id]/edit';

describe('Prompt edit page integration with PromptEditor and AI Assist', () => {
  beforeEach(() => {
    // seed localStorage with ai-assist result for example-1
    const key = 'ai-assist-result:example-1';
    const val = { text: 'Suggested AI addition.' };
    localStorage.setItem(key, JSON.stringify(val));
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('Apply AI Assist result updates editor body for example prompt', async () => {
    let renderer;
    await act(async () => {
      renderer = create(<PromptEditPage />);
      // allow effects to run
      await Promise.resolve();
    });

    const tree = renderer.toJSON();
    // find the Apply button by matching button with onClick and text
    const applyButtons = renderer.root.findAll(
      node => node.type === 'button' && node.props && node.props.children === 'Apply to editor'
    );
    expect(applyButtons.length).toBeGreaterThanOrEqual(1);

    // Click apply
    await act(async () => {
      applyButtons[0].props.onClick();
      await Promise.resolve();
    });

    // After applying, find the textarea in PromptEditor and check value
    const textareas = renderer.root.findAll(n => n.type === 'textarea');
    expect(textareas.length).toBeGreaterThanOrEqual(1);
    const ta = textareas[0];
    const val = ta.props.value;
    expect(val).toContain('Hello {{player.name}}'); // original example-1 body
    expect(val).toContain('Suggested AI addition.');
  });
});

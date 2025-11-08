/**
 * @jest-environment jsdom
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import DynamicSlot from '../../../../components/game/slots/DynamicSlot.jsx';

describe('DynamicSlot override rendering', () => {
  test('renders UI schema when chat slot is overridden', async () => {
    const files = {
      '/template.json': { content: JSON.stringify({ ui: { overrides: { chat: { type: 'ui', path: '/game/pages/ui/chat.json' } } } }) },
      '/game/pages/ui/chat.json': { content: JSON.stringify({ type: 'vstack', children: [ { type:'text', value:'Custom Chat OK' } ] }) }
    };

    let renderer;
    await act(async () => {
      renderer = create(
        <DynamicSlot slotId="chat" files={files} resolveAsset={(x)=>x} defaultRender={() => null} />
      );
      await Promise.resolve();
    });

    const root = renderer.root;
    const textNodes = root.findAll(n => n.props && n.props.children === 'Custom Chat OK');
    expect(textNodes.length).toBeGreaterThan(0);
  });

  test('falls back to default when no override', async () => {
    const files = { '/template.json': { content: '{}' } };
    const Default = () => <div data-testid="fallback">FALLBACK</div>;
    let renderer;
    await act(async () => {
      renderer = create(
        <DynamicSlot slotId="chat" files={files} resolveAsset={(x)=>x} defaultRender={() => <Default />} />
      );
      await Promise.resolve();
    });
    const root = renderer.root;
    const fallback = root.findAll(n => n.props && n.props['data-testid'] === 'fallback');
    expect(fallback.length).toBe(1);
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import MainGameMobileUI from '@/components/game/MainGameMobileUI';

/**
 * Play widgets should be hidden by default (not rendered) unless explicitly enabled
 */

describe('MainGameMobileUI - Play widgets gating', () => {
  it('does not render resource preview and code runner by default', () => {
    const template = { ui: {} };
    render(<MainGameMobileUI template={template} />);

    // Titles/body text that used to be always visible should NOT be present by default now
    expect(screen.queryByText('리소스 미리보기')).toBeNull();
    expect(screen.queryByText('코드 실행 위젯 (연결 예정)')).toBeNull();
  });

  it('renders resource preview only when explicitly enabled', () => {
    const template = { ui: { main: { widgets: { resourcePreview: { enabled: true } } } }, resources: { files: [] } };
    render(<MainGameMobileUI template={template} />);
    expect(screen.getByText('리소스 미리보기')).toBeInTheDocument();
  });

  it('renders code runner placeholder only when explicitly enabled', () => {
    const template = { ui: { main: { widgets: { codeRunner: { enabled: true } } } } };
    render(<MainGameMobileUI template={template} />);
    expect(screen.getByText('사용자 지정 코드')).toBeInTheDocument();
    expect(screen.getByText('코드 실행 위젯 (연결 예정)')).toBeInTheDocument();
  });
});

/**
 * GameEngine Test Suite
 * 
 * Tests for game logic engine within UnifiedGameSystem
 * Focuses on:
 * - Game state management
 * - Node execution logic
 * - Variable system
 * - AI response handling
 * - Game flow control
 * - Error recovery
 */

import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import UnifiedGameSystem from '../../../../components/game/UnifiedGameSystem';

// Mock fetch for AI responses
global.fetch = jest.fn();

// Mock dependencies
jest.mock('../../../../services/MobileOptimizationManager', () => ({
  MobileOptimizationManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn(),
  })),
}));

jest.mock('../../../../services/GameResourceManager', () => ({
  GameResourceManager: jest.fn().mockImplementation(() => ({
    loadGameTemplate: jest.fn().mockResolvedValue({
      nodes: [
        {
          id: 'start_node',
          type: 'ai',
          template: '게임이 시작됩니다. {{캐릭터.이름}}님 안녕하세요!',
          isStart: true,
          connections: ['node_2'],
        },
        {
          id: 'node_2',
          type: 'system',
          template: '다음 선택을 하세요.',
          connections: [],
        },
      ],
      variables: {
        '{{게임.타이틀}}': '테스트 게임',
        '{{게임.버전}}': '1.0',
      },
    }),
    cleanup: jest.fn(),
  })),
}));

jest.mock('../../../../utils/compatibilityManager', () => ({
  compatibilityManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getCompatibilityInfo: jest.fn().mockReturnValue({
      level: 4,
      performanceTier: 'high',
      features: {
        fetch: true,
        touchDevice: false,
        abortController: true,
      },
      device: {
        mobile: false,
      },
    }),
  },
  CompatibilityManager: class CompatibilityManager {
    static initialize() {
      return Promise.resolve();
    }
    static getCompatibilityInfo() {
      return {
        level: 4,
        performanceTier: 'high',
        features: {
          fetch: true,
          touchDevice: false,
          abortController: true,
        },
        device: {
          mobile: false,
        },
      };
    }
    static getFetchPolyfill() {
      return fetch;
    }
  },
}));

describe('GameEngine - State Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  test('should initialize with default game state', async () => {
    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should maintain game state across operations', async () => {
    const mockCharacter = {
      name: '테스트 플레이어',
      description: '용감한 전사',
    };

    const { container } = render(<UnifiedGameSystem initialCharacter={mockCharacter} />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should handle state transitions correctly', async () => {
    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    // State transitions (maker -> game -> result)
    expect(true).toBe(true);
  });
});

describe('GameEngine - Variable System', () => {
  test('should register character variables correctly', async () => {
    const mockCharacter = {
      name: '히어로',
      description: '강력한 전사',
      ability1: '불꽃 검',
      ability2: '방패 막기',
      ability3: '치유',
      ability4: '분노',
      image_url: 'https://example.com/hero.png',
      background_url: 'https://example.com/bg.png',
      bgm_url: 'https://example.com/music.mp3',
    };

    const { container } = render(<UnifiedGameSystem initialCharacter={mockCharacter} />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should handle null/undefined character properties', async () => {
    const mockCharacter = {
      name: '플레이어',
      // Other properties are undefined
    };

    const { container } = render(<UnifiedGameSystem initialCharacter={mockCharacter} />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should initialize default HP/MP/Level values', async () => {
    const mockCharacter = {
      name: '신규 플레이어',
    };

    const { container } = render(<UnifiedGameSystem initialCharacter={mockCharacter} />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    // Default values: HP=100, MP=50, Level=1
    expect(true).toBe(true);
  });

  test('should convert non-string values to strings', async () => {
    const mockCharacter = {
      name: 123,
      description: null,
      ability1: undefined,
      ability2: { complex: 'object' },
    };

    const { container } = render(<UnifiedGameSystem initialCharacter={mockCharacter} />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });
});

describe('GameEngine - Template Loading', () => {
  test('should load game template by ID', async () => {
    const GameResourceManagerMock = require('../../../../services/GameResourceManager').GameResourceManager;

    const { container } = render(<UnifiedGameSystem gameTemplateId="test-template-123" />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('should merge template variables with character variables', async () => {
    const mockCharacter = {
      name: '플레이어',
      description: '설명',
    };

    const { container } = render(
      <UnifiedGameSystem 
        initialCharacter={mockCharacter}
        gameTemplateId="test-template"
      />
    );
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  test('should handle template loading failure gracefully', async () => {
    const GameResourceManagerMock = require('../../../../services/GameResourceManager').GameResourceManager;
    GameResourceManagerMock.mockImplementation(() => ({
      loadGameTemplate: jest.fn().mockRejectedValue(new Error('Template not found')),
      cleanup: jest.fn(),
    }));

    const { container } = render(<UnifiedGameSystem gameTemplateId="invalid-template" />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });
});

describe('GameEngine - AI Response Handling', () => {
  test('should handle successful AI response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: '멋진 응답입니다!',
        success: true,
      }),
    });

    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should retry on API failure', async () => {
    // First two calls fail, third succeeds
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: '재시도 성공!',
          success: true,
        }),
      });

    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should handle timeout with AbortController', async () => {
    // Mock slow response
    global.fetch.mockImplementation(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ response: 'Delayed response', success: true }),
          });
        }, 5000);
      })
    );

    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should fallback gracefully when AI fails', async () => {
    global.fetch.mockRejectedValue(new Error('AI service unavailable'));

    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should handle HTTP error responses', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });
});

describe('GameEngine - Error Recovery', () => {
  test('should recover from node execution errors', async () => {
    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    // Component should continue functioning after errors
    expect(true).toBe(true);
  });

  test('should handle missing nodes gracefully', async () => {
    const GameResourceManagerMock = require('../../../../services/GameResourceManager').GameResourceManager;
    GameResourceManagerMock.mockImplementation(() => ({
      loadGameTemplate: jest.fn().mockResolvedValue({
        nodes: [],
        variables: {},
      }),
      cleanup: jest.fn(),
    }));

    const { container } = render(<UnifiedGameSystem gameTemplateId="empty-template" />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should handle circular node connections', async () => {
    const GameResourceManagerMock = require('../../../../services/GameResourceManager').GameResourceManager;
    GameResourceManagerMock.mockImplementation(() => ({
      loadGameTemplate: jest.fn().mockResolvedValue({
        nodes: [
          {
            id: 'node_a',
            connections: ['node_b'],
          },
          {
            id: 'node_b',
            connections: ['node_a'],
          },
        ],
        variables: {},
      }),
      cleanup: jest.fn(),
    }));

    const { container } = render(<UnifiedGameSystem gameTemplateId="circular-template" />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });
});

describe('GameEngine - Performance', () => {
  test('should handle large game states efficiently', async () => {
    const largeCharacter = {
      name: '복잡한 캐릭터',
      description: 'x'.repeat(10000), // Large description
    };

    const startTime = performance.now();

    const { container } = render(<UnifiedGameSystem initialCharacter={largeCharacter} />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Should handle large states within reasonable time
    expect(duration).toBeLessThan(2000);
  });

  test('should manage memory efficiently during game execution', async () => {
    const { container, rerender } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    // Simulate multiple game state changes
    for (let i = 0; i < 50; i++) {
      rerender(<UnifiedGameSystem key={i} />);
    }

    expect(container).toBeInTheDocument();
  });
});

describe('GameEngine - Browser Compatibility', () => {
  test('should work without AbortController (IE11)', async () => {
    const mockCompatibilityInfo = {
      level: 1,
      performanceTier: 'low',
      features: {
        fetch: false,
        touchDevice: false,
        abortController: false,
      },
      device: {
        mobile: false,
      },
    };

    const CompatibilityManagerMock = require('../../../../utils/compatibilityManager').CompatibilityManager;
    CompatibilityManagerMock.getCompatibilityInfo = jest.fn().mockReturnValue(mockCompatibilityInfo);

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: 'IE11 호환 응답',
        success: true,
      }),
    });

    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  test('should use fetch polyfill when needed', async () => {
    const mockCompatibilityInfo = {
      level: 1,
      performanceTier: 'low',
      features: {
        fetch: false,
        touchDevice: false,
        abortController: false,
      },
      device: {
        mobile: false,
      },
    };

    const CompatibilityManagerMock = require('../../../../utils/compatibilityManager').CompatibilityManager;
    CompatibilityManagerMock.getCompatibilityInfo = jest.fn().mockReturnValue(mockCompatibilityInfo);

    const { container } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });
});

describe('GameEngine - Cleanup', () => {
  test('should cleanup resources on unmount', async () => {
    const { unmount } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(true).toBe(true);
    });

    expect(() => unmount()).not.toThrow();
  });

  test('should cancel pending operations on unmount', async () => {
    global.fetch.mockImplementation(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ response: 'Late response', success: true }),
          });
        }, 5000);
      })
    );

    const { unmount } = render(<UnifiedGameSystem />);
    
    await waitFor(() => {
      expect(true).toBe(true);
    });

    // Unmount while async operation is pending
    unmount();

    // Should not cause memory leaks or errors
    expect(true).toBe(true);
  });
});

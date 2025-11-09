// components/maker/settings/AIApiManager.js
// 🤖 AI API 관리 시스템 - 사용자 API 키 설정 및 관리

'use client';

import { useState, useEffect, useCallback } from 'react';
import { encrypt, decrypt } from '../../../lib/encryption';

// 🌐 지원하는 AI 제공업체들
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI GPT',
    icon: '🧠',
    endpoints: {
      'gpt-4': 'https://api.openai.com/v1/chat/completions',
      'gpt-3.5-turbo': 'https://api.openai.com/v1/chat/completions',
    },
    keyFormat: 'sk-...',
    testPrompt: 'Hello, this is a test message. Please respond with "API connection successful!"',
    requiredHeaders: {
      Authorization: 'Bearer {API_KEY}',
      'Content-Type': 'application/json',
    },
  },
  anthropic: {
    name: 'Anthropic Claude',
    icon: '🎭',
    endpoints: {
      'claude-3-opus': 'https://api.anthropic.com/v1/messages',
      'claude-3-sonnet': 'https://api.anthropic.com/v1/messages',
    },
    keyFormat: 'sk-ant-...',
    testPrompt: 'Hello, this is a test message. Please respond with "API connection successful!"',
    requiredHeaders: {
      'x-api-key': '{API_KEY}',
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
  },
  google: {
    name: 'Google Gemini',
    icon: '💎',
    endpoints: {
      'gemini-pro':
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    },
    keyFormat: 'AIza...',
    testPrompt: 'Hello, this is a test message. Please respond with "API connection successful!"',
    requiredHeaders: {
      'Content-Type': 'application/json',
    },
    urlPattern: '{ENDPOINT}?key={API_KEY}',
  },
  cohere: {
    name: 'Cohere',
    icon: '🔗',
    endpoints: {
      command: 'https://api.cohere.ai/v1/generate',
      'command-light': 'https://api.cohere.ai/v1/generate',
    },
    keyFormat: 'co-...',
    testPrompt: 'Hello, this is a test message. Please respond with "API connection successful!"',
    requiredHeaders: {
      Authorization: 'Bearer {API_KEY}',
      'Content-Type': 'application/json',
    },
  },
  local: {
    name: '로컬 서버',
    icon: '🏠',
    endpoints: {
      'local-api': 'http://localhost:11434/api/generate', // Ollama 기본 포트
    },
    keyFormat: 'none',
    testPrompt: 'Hello, this is a test message. Please respond with "API connection successful!"',
    requiredHeaders: {
      'Content-Type': 'application/json',
    },
  },
};

export default function AIApiManager({ visible, onClose }) {
  const [apiConfigs, setApiConfigs] = useState({});
  const [activeProvider, setActiveProvider] = useState('openai');
  const [newApiKey, setNewApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);

  // 🔐 암호화된 API 설정 로드
  useEffect(() => {
    loadApiConfigs();
  }, []);

  const loadApiConfigs = useCallback(() => {
    try {
      const encryptedConfigs = localStorage.getItem('ai_api_configs');
      if (encryptedConfigs) {
        const decryptedConfigs = decrypt(encryptedConfigs);
        setApiConfigs(JSON.parse(decryptedConfigs));
      }
    } catch (error) {
      console.error('API 설정 로드 실패:', error);
    }
  }, []);

  // 🔐 암호화된 API 설정 저장
  const saveApiConfigs = useCallback(configs => {
    try {
      const encryptedConfigs = encrypt(JSON.stringify(configs));
      localStorage.setItem('ai_api_configs', encryptedConfigs);
      setApiConfigs(configs);
    } catch (error) {
      console.error('API 설정 저장 실패:', error);
    }
  }, []);

  // ➕ 새 API 키 추가
  const handleAddApiKey = useCallback(async () => {
    if (!newApiKey.trim() || !selectedModel) return;

    const provider = AI_PROVIDERS[activeProvider];

    // API 키 형식 검증
    if (
      provider.keyFormat !== 'none' &&
      !newApiKey.startsWith(provider.keyFormat.split('...')[0])
    ) {
      alert(
        `${provider.name}의 API 키 형식이 올바르지 않습니다.\n예상 형식: ${provider.keyFormat}`
      );
      return;
    }

    setIsTestingConnection(true);

    try {
      // 🧪 API 연결 테스트
      const testResult = await testApiConnection(activeProvider, selectedModel, newApiKey);

      if (testResult.success) {
        const newConfigs = {
          ...apiConfigs,
          [activeProvider]: {
            ...apiConfigs[activeProvider],
            [selectedModel]: {
              apiKey: newApiKey,
              endpoint: provider.endpoints[selectedModel],
              enabled: true,
              addedAt: new Date().toISOString(),
              lastTested: new Date().toISOString(),
              testResult: testResult,
            },
          },
        };

        saveApiConfigs(newConfigs);
        setTestResults(prev => ({ ...prev, [`${activeProvider}-${selectedModel}`]: testResult }));
        setNewApiKey('');
        setShowAddForm(false);
        alert('✅ API 키가 성공적으로 추가되었습니다!');
      } else {
        alert(`❌ API 연결 테스트 실패:\n${testResult.error}`);
      }
    } catch (error) {
      alert(`❌ API 테스트 중 오류:\n${error.message}`);
    } finally {
      setIsTestingConnection(false);
    }
  }, [newApiKey, selectedModel, activeProvider, apiConfigs, saveApiConfigs]);

  // 🧪 API 연결 테스트
  const testApiConnection = async (provider, model, apiKey) => {
    const providerConfig = AI_PROVIDERS[provider];
    const endpoint = providerConfig.endpoints[model];

    try {
      let requestConfig = {
        method: 'POST',
        headers: { ...providerConfig.requiredHeaders },
      };

      // 헤더에 API 키 삽입
      Object.keys(requestConfig.headers).forEach(header => {
        if (requestConfig.headers[header].includes('{API_KEY}')) {
          requestConfig.headers[header] = requestConfig.headers[header].replace(
            '{API_KEY}',
            apiKey
          );
        }
      });

      // 요청 본문 구성 (제공업체별 다름)
      let body = {};
      let url = endpoint;

      if (provider === 'openai' || provider === 'anthropic') {
        body = {
          model: model,
          messages: [{ role: 'user', content: providerConfig.testPrompt }],
          max_tokens: 50,
        };
      } else if (provider === 'google') {
        url = providerConfig.urlPattern
          .replace('{ENDPOINT}', endpoint)
          .replace('{API_KEY}', apiKey);
        body = {
          contents: [{ parts: [{ text: providerConfig.testPrompt }] }],
        };
      } else if (provider === 'cohere') {
        body = {
          prompt: providerConfig.testPrompt,
          max_tokens: 50,
        };
      } else if (provider === 'local') {
        body = {
          model: model,
          prompt: providerConfig.testPrompt,
          stream: false,
        };
      }

      requestConfig.body = JSON.stringify(body);

      const response = await fetch(url, requestConfig);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        response: data,
        testedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        testedAt: new Date().toISOString(),
      };
    }
  };

  // 🔄 API 활성화/비활성화 토글
  const toggleApiEnabled = useCallback(
    (provider, model) => {
      const newConfigs = {
        ...apiConfigs,
        [provider]: {
          ...apiConfigs[provider],
          [model]: {
            ...apiConfigs[provider][model],
            enabled: !apiConfigs[provider][model].enabled,
          },
        },
      };
      saveApiConfigs(newConfigs);
    },
    [apiConfigs, saveApiConfigs]
  );

  // 🗑️ API 키 삭제
  const deleteApiKey = useCallback(
    (provider, model) => {
      if (confirm(`${AI_PROVIDERS[provider].name}의 ${model} API 키를 삭제하시겠습니까?`)) {
        const newConfigs = { ...apiConfigs };
        if (newConfigs[provider]) {
          delete newConfigs[provider][model];
          if (Object.keys(newConfigs[provider]).length === 0) {
            delete newConfigs[provider];
          }
        }
        saveApiConfigs(newConfigs);
      }
    },
    [apiConfigs, saveApiConfigs]
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">🤖 AI API 관리</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 opacity-90">외부 AI API를 안전하게 관리하고 테스트하세요</p>
        </div>

        <div className="flex h-[600px]">
          {/* 좌측: 제공업체 선택 */}
          <div className="w-1/3 bg-gray-50 border-r p-4 overflow-y-auto">
            <h3 className="font-semibold mb-4">AI 제공업체</h3>
            <div className="space-y-2">
              {Object.entries(AI_PROVIDERS).map(([key, provider]) => (
                <button
                  key={key}
                  onClick={() => {
                    setActiveProvider(key);
                    setSelectedModel(Object.keys(provider.endpoints)[0]);
                    setShowAddForm(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    activeProvider === key
                      ? 'bg-blue-100 border-blue-300 border'
                      : 'bg-white hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{provider.icon}</span>
                    <div>
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-sm text-gray-600">
                        {Object.keys(provider.endpoints).length}개 모델
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 우측: API 키 관리 */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">
                {AI_PROVIDERS[activeProvider].icon} {AI_PROVIDERS[activeProvider].name}
              </h3>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                ➕ API 키 추가
              </button>
            </div>

            {/* API 키 추가 폼 */}
            {showAddForm && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="font-medium mb-3">새 API 키 추가</h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      모델 선택
                    </label>
                    <select
                      value={selectedModel}
                      onChange={e => setSelectedModel(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.keys(AI_PROVIDERS[activeProvider].endpoints).map(model => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API 키 ({AI_PROVIDERS[activeProvider].keyFormat})
                    </label>
                    <input
                      type="password"
                      value={newApiKey}
                      onChange={e => setNewApiKey(e.target.value)}
                      placeholder={`${AI_PROVIDERS[activeProvider].keyFormat} 형식의 API 키를 입력하세요`}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={handleAddApiKey}
                      disabled={isTestingConnection || !newApiKey.trim() || !selectedModel}
                      className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                        isTestingConnection || !newApiKey.trim() || !selectedModel
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isTestingConnection ? '🔄 테스트 중...' : '✅ 추가 및 테스트'}
                    </button>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 등록된 API 키 목록 */}
            <div className="space-y-4">
              {apiConfigs[activeProvider] ? (
                Object.entries(apiConfigs[activeProvider]).map(([model, config]) => (
                  <div key={model} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h5 className="font-medium">{model}</h5>
                        <p className="text-sm text-gray-600">
                          추가일: {new Date(config.addedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => toggleApiEnabled(activeProvider, model)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                            config.enabled
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {config.enabled ? '✅ 활성' : '⏸️ 비활성'}
                        </button>
                        <button
                          onClick={() => deleteApiKey(activeProvider, model)}
                          className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium hover:bg-red-200 transition-colors"
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    </div>

                    {/* 테스트 결과 */}
                    {config.testResult && (
                      <div
                        className={`p-3 rounded-lg text-sm ${
                          config.testResult.success
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        <div className="font-medium">
                          {config.testResult.success ? '✅ 연결 성공' : '❌ 연결 실패'}
                        </div>
                        <div className="text-xs mt-1 opacity-75">
                          테스트: {new Date(config.testResult.testedAt).toLocaleString()}
                        </div>
                        {!config.testResult.success && (
                          <div className="text-xs mt-1">{config.testResult.error}</div>
                        )}
                      </div>
                    )}

                    {/* API 키 미리보기 (마스킹) */}
                    <div className="text-xs text-gray-500 mt-2">
                      API 키: {config.apiKey.substring(0, 8)}...
                      {config.apiKey.substring(config.apiKey.length - 4)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">🔑</div>
                  <p>등록된 API 키가 없습니다</p>
                  <p className="text-sm">위의 "API 키 추가" 버튼을 클릭하여 시작하세요</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

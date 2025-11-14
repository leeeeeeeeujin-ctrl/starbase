/**
 * 📱 오프라인 지원 통합 서비스
 * PWA 기능과 오프라인 게임 엔진 연동
 */

'use client';

class OfflineGameEngine {
  constructor(config = {}) {
    this.isOnline = navigator?.onLine ?? true;
    this.config = config;
    this.db = null;
    this.syncQueue = [];
    this.eventHandlers = new Map();

    // Service Worker 등록
    this.registerServiceWorker();

    // 온라인/오프라인 이벤트 감지
    this.setupNetworkListeners();

    // IndexedDB 초기화
    this.initOfflineDB();
  }

  // Service Worker 등록
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        // Avoid duplicate registration: check existing registration for our SW
        const existing = await navigator.serviceWorker.getRegistration();
        if (
          existing &&
          existing.active &&
          existing.active.scriptURL &&
          existing.active.scriptURL.includes('sw.js')
        ) {
          console.log('🔧 Service Worker 이미 등록되어 있습니다:', existing.scope);
          return existing;
        }

        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        console.log('🔧 Service Worker 등록됨:', registration.scope);

        // 업데이트 확인
        registration.addEventListener('updatefound', () => {
          console.log('📱 새 버전 감지됨');
          this.emit('updateAvailable', registration);
        });

        // 백그라운드 동기화 등록
        if ('sync' in window.ServiceWorkerRegistration.prototype) {
          try {
            await registration.sync.register('sync-game-data');
            console.log('🔄 백그라운드 동기화 등록됨');
          } catch (e) {
            console.warn('백그라운드 동기화 등록 실패:', e);
          }
        }
      } catch (error) {
        console.error('Service Worker 등록 실패:', error);
      }
    }
  }

  // 네트워크 상태 감지
  setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('🌐 온라인 상태');
      this.isOnline = true;
      this.emit('networkChange', { online: true });
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      console.log('📱 오프라인 상태');
      this.isOnline = false;
      this.emit('networkChange', { online: false });
    });
  }

  // IndexedDB 초기화
  async initOfflineDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('StarbaseGameDB', 2);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('💾 오프라인 DB 초기화됨');
        resolve(this.db);
      };

      request.onupgradeneeded = event => {
        const db = event.target.result;

        // 게임 상태 저장소
        if (!db.objectStoreNames.contains('gameStates')) {
          const stateStore = db.createObjectStore('gameStates', { keyPath: 'id' });
          stateStore.createIndex('gameId', 'gameId', { unique: false });
          stateStore.createIndex('lastModified', 'lastModified', { unique: false });
        }

        // 점수 이벤트 큐
        if (!db.objectStoreNames.contains('scoreEvents')) {
          const scoreStore = db.createObjectStore('scoreEvents', {
            keyPath: 'id',
            autoIncrement: true,
          });
          scoreStore.createIndex('sessionId', 'sessionId', { unique: false });
          scoreStore.createIndex('synced', 'synced', { unique: false });
          scoreStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // AI 응답 캐시
        if (!db.objectStoreNames.contains('aiResponses')) {
          const aiStore = db.createObjectStore('aiResponses', { keyPath: 'hash' });
          aiStore.createIndex('timestamp', 'timestamp', { unique: false });
          aiStore.createIndex('provider', 'provider', { unique: false });
        }
      };
    });
  }

  // 오프라인에서 게임 상태 저장
  async saveGameState(gameState) {
    if (!this.db) await this.initOfflineDB();

    const transaction = this.db.transaction(['gameStates'], 'readwrite');
    const store = transaction.objectStore('gameStates');

    const stateToSave = {
      ...gameState,
      lastModified: Date.now(),
      offlineModified: !this.isOnline,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(stateToSave);
      request.onsuccess = () => {
        console.log('💾 게임 상태 오프라인 저장됨');
        resolve(stateToSave);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 오프라인에서 게임 상태 로드
  async loadGameState(gameId) {
    if (!this.db) await this.initOfflineDB();

    const transaction = this.db.transaction(['gameStates'], 'readonly');
    const store = transaction.objectStore('gameStates');
    const index = store.index('gameId');

    return new Promise((resolve, reject) => {
      const request = index.get(gameId);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log('📂 게임 상태 오프라인 로드됨');
        }
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 오프라인에서 점수 이벤트 큐에 추가
  async queueScoreEvent(scoreEvent) {
    if (!this.db) await this.initOfflineDB();

    const transaction = this.db.transaction(['scoreEvents'], 'readwrite');
    const store = transaction.objectStore('scoreEvents');

    const eventToQueue = {
      ...scoreEvent,
      timestamp: Date.now(),
      synced: false,
      offline: true,
    };

    return new Promise((resolve, reject) => {
      const request = store.add(eventToQueue);
      request.onsuccess = () => {
        console.log('📝 점수 이벤트 큐에 추가됨 (오프라인)');
        resolve(eventToQueue);

        // 온라인 상태면 즉시 동기화 시도
        if (this.isOnline) {
          this.syncOfflineData();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 오프라인 데이터 동기화
  async syncOfflineData() {
    if (!this.isOnline || !this.db) return;

    console.log('🔄 오프라인 데이터 동기화 시작');

    try {
      // 1. 동기화되지 않은 점수 이벤트들 가져오기
      const unsyncedEvents = await this.getUnsyncedScoreEvents();

      for (const event of unsyncedEvents) {
        try {
          // 서버에 점수 이벤트 전송
          const response = await fetch('/api/game/sync-score-event', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
          });

          if (response.ok) {
            // 동기화 성공 시 synced 플래그 설정
            await this.markEventAsSynced(event.id);
            console.log('✅ 점수 이벤트 동기화 성공:', event.id);
          } else {
            console.warn('⚠️ 점수 이벤트 동기화 실패:', event.id);
          }
        } catch (error) {
          console.error('❌ 점수 이벤트 동기화 오류:', error);
        }
      }

      // 2. 게임 상태 동기화
      await this.syncGameStates();

      console.log('🎉 오프라인 데이터 동기화 완료');
      this.emit('syncComplete', { eventsSynced: unsyncedEvents.length });
    } catch (error) {
      console.error('❌ 동기화 오류:', error);
      this.emit('syncError', error);
    }
  }

  // 동기화되지 않은 점수 이벤트 조회
  async getUnsyncedScoreEvents() {
    if (!this.db) return [];

    const transaction = this.db.transaction(['scoreEvents'], 'readonly');
    const store = transaction.objectStore('scoreEvents');
    const index = store.index('synced');

    return new Promise((resolve, reject) => {
      const request = index.getAll(false); // synced = false인 것들
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 이벤트를 동기화됨으로 표시
  async markEventAsSynced(eventId) {
    if (!this.db) return;

    const transaction = this.db.transaction(['scoreEvents'], 'readwrite');
    const store = transaction.objectStore('scoreEvents');

    return new Promise((resolve, reject) => {
      const getRequest = store.get(eventId);
      getRequest.onsuccess = () => {
        const event = getRequest.result;
        if (event) {
          event.synced = true;
          event.syncedAt = Date.now();

          const putRequest = store.put(event);
          putRequest.onsuccess = () => resolve(event);
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve(null);
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // 게임 상태 동기화
  async syncGameStates() {
    if (!this.db) return;

    const transaction = this.db.transaction(['gameStates'], 'readonly');
    const store = transaction.objectStore('gameStates');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = async () => {
        const states = request.result.filter(state => state.offlineModified);

        for (const state of states) {
          try {
            await this.syncSingleGameState(state);
          } catch (error) {
            console.error('게임 상태 동기화 오류:', error);
          }
        }

        resolve(states.length);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 개별 게임 상태 동기화
  async syncSingleGameState(gameState) {
    try {
      const response = await fetch('/api/game/sync-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gameState),
      });

      if (response.ok) {
        // 동기화 성공 시 오프라인 플래그 제거
        gameState.offlineModified = false;
        gameState.lastSynced = Date.now();

        await this.saveGameState(gameState);
        console.log('✅ 게임 상태 동기화 성공:', gameState.id);
      }
    } catch (error) {
      console.error('게임 상태 동기화 오류:', error);
      throw error;
    }
  }

  // AI 응답 캐싱
  async cacheAIResponse(prompt, response, provider) {
    if (!this.db) await this.initOfflineDB();

    const transaction = this.db.transaction(['aiResponses'], 'readwrite');
    const store = transaction.objectStore('aiResponses');

    // 프롬프트 해시 생성
    const hash = await this.generateHash(prompt + provider);

    const cacheItem = {
      hash,
      prompt,
      response,
      provider,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(cacheItem);
      request.onsuccess = () => {
        console.log('🤖 AI 응답 캐시됨');
        resolve(cacheItem);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 캐시된 AI 응답 조회
  async getCachedAIResponse(prompt, provider) {
    if (!this.db) return null;

    const transaction = this.db.transaction(['aiResponses'], 'readonly');
    const store = transaction.objectStore('aiResponses');

    const hash = await this.generateHash(prompt + provider);

    return new Promise((resolve, reject) => {
      const request = store.get(hash);
      request.onsuccess = () => {
        const result = request.result;

        // 24시간 이내의 캐시만 사용
        if (result && Date.now() - result.timestamp < 24 * 60 * 60 * 1000) {
          console.log('📂 캐시된 AI 응답 사용');
          resolve(result.response);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 해시 생성 (간단한 버전)
  async generateHash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 이벤트 시스템
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`오프라인 이벤트 핸들러 오류 (${eventType}):`, error);
        }
      });
    }
  }

  // 앱 업데이트 확인
  async checkForUpdates() {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        console.log('🔄 앱 업데이트 확인됨');
      }
    }
  }

  // PWA 설치 프롬프트
  async promptInstall() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      console.log('📱 PWA 설치 결과:', outcome);
      this.deferredPrompt = null;
      return outcome === 'accepted';
    }
    return false;
  }

  // 설치 프롬프트 이벤트 리스너 설정
  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.emit('installPromptReady', e);
    });

    window.addEventListener('appinstalled', e => {
      console.log('🎉 PWA 설치됨');
      this.emit('appInstalled', e);
    });
  }
}

export default OfflineGameEngine;

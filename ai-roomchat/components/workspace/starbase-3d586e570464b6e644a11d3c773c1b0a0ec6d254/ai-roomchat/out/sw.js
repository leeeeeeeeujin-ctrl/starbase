/**
 * 📱 Service Worker - 오프라인 지원 및 PWA
 * 게임 데이터 캐싱, 백그라운드 동기화
 */

// public/sw.js
const CACHE_NAME = 'starbase-ai-game-v1.0.1';

// 캐시할 리소스들
const STATIC_RESOURCES = [
  '/',
  '/offline',
  '/manifest.json',
  '/icon.png',
  // CSS/JS 파일들은 빌드 시 자동 추가
];

// 오프라인에서도 작동해야 하는 페이지들
const OFFLINE_PAGES = ['/', '/game', '/projects', '/offline'];

// IndexedDB 관리 클래스
class OfflineDB {
  constructor() {
    this.dbName = 'StarbaseOfflineDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = event => {
        const db = event.target.result;

        // 게임 세션 저장소
        if (!db.objectStoreNames.contains('gameSessions')) {
          const sessionStore = db.createObjectStore('gameSessions', { keyPath: 'id' });
          sessionStore.createIndex('projectId', 'projectId', { unique: false });
          sessionStore.createIndex('status', 'status', { unique: false });
          sessionStore.createIndex('lastModified', 'lastModified', { unique: false });
        }

        // 프로젝트 파일 저장소
        if (!db.objectStoreNames.contains('projectFiles')) {
          const fileStore = db.createObjectStore('projectFiles', { keyPath: 'id' });
          fileStore.createIndex('projectId', 'projectId', { unique: false });
          fileStore.createIndex('filePath', 'filePath', { unique: false });
        }

        // 동기화 큐
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', {
            keyPath: 'id',
            autoIncrement: true,
          });
          syncStore.createIndex('operation', 'operation', { unique: false });
          syncStore.createIndex('priority', 'priority', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // AI API 캐시
        if (!db.objectStoreNames.contains('aiCache')) {
          const cacheStore = db.createObjectStore('aiCache', { keyPath: 'key' });
          cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async saveGameSession(session) {
    if (!this.db) await this.init();

    const transaction = this.db.transaction(['gameSessions'], 'readwrite');
    const store = transaction.objectStore('gameSessions');

    session.lastModified = Date.now();
    session.offlineModified = true;

    return new Promise((resolve, reject) => {
      const request = store.put(session);
      request.onsuccess = () => resolve(session);
      request.onerror = () => reject(request.error);
    });
  }

  async getGameSession(sessionId) {
    if (!this.db) await this.init();

    const transaction = this.db.transaction(['gameSessions'], 'readonly');
    const store = transaction.objectStore('gameSessions');

    return new Promise((resolve, reject) => {
      const request = store.get(sessionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async addToSyncQueue(operation) {
    if (!this.db) await this.init();

    const transaction = this.db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');

    operation.timestamp = Date.now();
    operation.retryCount = 0;

    return new Promise((resolve, reject) => {
      const request = store.add(operation);
      request.onsuccess = () => resolve(operation);
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueue() {
    if (!this.db) await this.init();

    const transaction = this.db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

const offlineDB = new OfflineDB();

// Service Worker 이벤트 핸들러들
self.addEventListener('install', event => {
  console.log('[SW] 설치 중...', CACHE_NAME);

  event.waitUntil(
    (async () => {
  const cache = await caches.open(CACHE_NAME);
  // 사전 캐시: 정적 리소스와 오프라인 페이지
  await cache.addAll(STATIC_RESOURCES);
      console.log('[SW] 정적 리소스 캐시 완료');

      // 오프라인 DB 초기화
      await offlineDB.init();
      console.log('[SW] 오프라인 DB 초기화 완료');
    })()
  );

  // 즉시 활성화
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] 활성화됨');

  event.waitUntil(
    (async () => {
      // 이전 캐시 정리
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );

      console.log('[SW] 이전 캐시 정리 완료');
    })()
  );

  // 모든 클라이언트 제어
  self.clients.claim();
});

// 네트워크 요청 가로채기
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 게임 API 요청 처리
  if (url.pathname.startsWith('/api/game/')) {
    event.respondWith(handleGameAPI(request));
    return;
  }

  // AI API 요청 처리
  if (url.pathname.startsWith('/api/ai/')) {
    event.respondWith(handleAIAPI(request));
    return;
  }

  // 정적 리소스 처리
  if (request.method === 'GET') {
    event.respondWith(handleStaticRequest(request));
    return;
  }
});

// 게임 API 오프라인 처리
async function handleGameAPI(request) {
  const url = new URL(request.url);
  try {
    // 온라인 우선 시도: 실패 시 오프라인 핸들러로 폴백
    const response = await fetch(request);
    if (response.ok) {
      const clonedResponse = response.clone();
      const data = await clonedResponse.json();
      if (url.pathname.includes('/sessions/')) {
        await offlineDB.saveGameSession(data);
      }
    }
    return response;
  } catch (error) {
    console.log('[SW] API 오류, 오프라인 모드로 전환:', error);
    return await handleOfflineGameAPI(request, url);
  }
}

// 오프라인 게임 API 처리
async function handleOfflineGameAPI(request, url) {
  const method = request.method;
  const pathname = url.pathname;

  try {
    if (method === 'GET' && pathname.includes('/sessions/')) {
      // 세션 조회
      const sessionId = pathname.split('/').pop();
      const session = await offlineDB.getGameSession(sessionId);

      if (session) {
        return new Response(JSON.stringify(session), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (method === 'POST' || method === 'PUT') {
      // 세션 생성/업데이트를 동기화 큐에 추가
      const body = await request.json();

      await offlineDB.addToSyncQueue({
        operation: 'api_call',
        method,
        url: request.url,
        body,
        priority: method === 'POST' ? 1 : 2,
      });

      // 로컬에서 즉시 처리 (게임 계속 진행 가능)
      if (pathname.includes('/score')) {
        const mockResponse = {
          success: true,
          offline: true,
          message: '오프라인 모드: 온라인 시 자동 동기화됩니다',
        };

        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 기본 오프라인 응답
    return new Response(
      JSON.stringify({
        success: false,
        offline: true,
        message: '오프라인 상태입니다. 네트워크 연결을 확인해주세요.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[SW] 오프라인 API 처리 오류:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// AI API 오프라인 처리 (캐싱 활용)
async function handleAIAPI(request) {
  try {
    // 온라인에서 실제 API 호출
    const response = await fetch(request);

    if (response.ok) {
      // 성공한 응답을 캐시에 저장
      const clonedResponse = response.clone();
      const data = await clonedResponse.json();

      const cacheKey = await generateCacheKey(request);
      await cacheAIResponse(cacheKey, data);
    }

    return response;
  } catch (error) {
    console.log('[SW] AI API 오프라인 모드');

    // 오프라인 시 캐시된 응답 반환
    const cacheKey = await generateCacheKey(request);
    const cachedResponse = await getCachedAIResponse(cacheKey);

    if (cachedResponse) {
      cachedResponse.offline = true;
      cachedResponse.cached = true;

      return new Response(JSON.stringify(cachedResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 캐시도 없으면 오프라인 안내
    return new Response(
      JSON.stringify({
        success: false,
        offline: true,
        message: 'AI 기능은 인터넷 연결이 필요합니다.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// 정적 리소스 캐시-퍼스트 전략
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);

    // 성공한 응답은 캐시에 저장
    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // 오프라인 시 오프라인 페이지 반환
    const url = new URL(request.url);

    if (OFFLINE_PAGES.includes(url.pathname)) {
      const offlinePage = await cache.match('/offline');
      if (offlinePage) return offlinePage;
    }

    // 기본 오프라인 응답
    return new Response('오프라인 상태입니다.', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

// 백그라운드 동기화
self.addEventListener('sync', event => {
  console.log('[SW] 백그라운드 동기화:', event.tag);

  if (event.tag === 'sync-game-data') {
    event.waitUntil(syncGameData());
  }
});

// 게임 데이터 동기화
async function syncGameData() {
  try {
    const syncQueue = await offlineDB.getSyncQueue();
    console.log('[SW] 동기화할 항목:', syncQueue.length);

    for (const item of syncQueue) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item.body),
        });

        if (response.ok) {
          console.log('[SW] 동기화 성공:', item.operation);
          // 성공한 항목은 큐에서 제거
          await removeFromSyncQueue(item.id);
        } else {
          console.log('[SW] 동기화 실패:', response.status);
          await incrementRetryCount(item.id);
        }
      } catch (error) {
        console.error('[SW] 동기화 오류:', error);
        await incrementRetryCount(item.id);
      }
    }
  } catch (error) {
    console.error('[SW] 백그라운드 동기화 오류:', error);
  }
}

// 헬퍼 함수들
async function generateCacheKey(request) {
  const body = request.method === 'POST' ? await request.clone().text() : '';
  const keyString = request.url + request.method + body;

  const msgBuffer = new TextEncoder().encode(keyString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cacheAIResponse(key, data) {
  if (!offlineDB.db) await offlineDB.init();

  const transaction = offlineDB.db.transaction(['aiCache'], 'readwrite');
  const store = transaction.objectStore('aiCache');

  const cacheItem = {
    key,
    data,
    timestamp: Date.now(),
  };

  store.put(cacheItem);
}

async function getCachedAIResponse(key) {
  if (!offlineDB.db) await offlineDB.init();

  const transaction = offlineDB.db.transaction(['aiCache'], 'readonly');
  const store = transaction.objectStore('aiCache');

  return new Promise(resolve => {
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      if (result && Date.now() - result.timestamp < 24 * 60 * 60 * 1000) {
        // 24시간 유효
        resolve(result.data);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => resolve(null);
  });
}

console.log('[SW] Service Worker 로드 완료');

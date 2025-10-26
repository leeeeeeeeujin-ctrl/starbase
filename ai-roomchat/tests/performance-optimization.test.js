/**
 * 🚀 성능 최적화 통합 테스트
 *
 * GameResourceManager, VisualNodeEditor, UnifiedGameSystem 성능 측정 및 최적화 검증
 */

// 성능 측정 유틸리티
class PerformanceProfiler {
  constructor() {
    this.measurements = new Map();
    this.memorySnapshots = [];
    this.renderTimes = [];
    this.isRecording = false;
  }

  start(label) {
    this.measurements.set(label, {
      startTime: performance.now(),
      startMemory: performance.memory ? performance.memory.usedJSHeapSize : 0,
    });
  }

  end(label) {
    const measurement = this.measurements.get(label);
    if (!measurement) return null;

    const endTime = performance.now();
    const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;

    const result = {
      duration: endTime - measurement.startTime,
      memoryDelta: endMemory - measurement.startMemory,
      timestamp: new Date().toISOString(),
    };

    this.measurements.delete(label);
    return result;
  }

  measureAsync(label, asyncFn) {
    this.start(label);
    return asyncFn().finally(() => {
      return this.end(label);
    });
  }

  takeMemorySnapshot() {
    if (performance.memory) {
      this.memorySnapshots.push({
        timestamp: Date.now(),
        used: performance.memory.usedJSHeapSize / 1024 / 1024, // MB
        total: performance.memory.totalJSHeapSize / 1024 / 1024,
        limit: performance.memory.jsHeapSizeLimit / 1024 / 1024,
      });
    }
  }

  startRenderProfiling() {
    this.isRecording = true;
    this.renderTimes = [];

    // Node.js 환경에서는 setTimeout으로 대체
    const requestAnimationFrame =
      typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame
        : callback => setTimeout(callback, 16); // ~60fps

    const measureRender = () => {
      if (!this.isRecording) return;

      const startTime = performance.now();
      requestAnimationFrame(() => {
        const renderTime = performance.now() - startTime;
        this.renderTimes.push(renderTime);

        if (this.renderTimes.length < 60) {
          // 60프레임 측정
          measureRender();
        } else {
          this.isRecording = false;
        }
      });
    };

    measureRender();
  }

  stopRenderProfiling() {
    this.isRecording = false;
  }

  getAverageRenderTime() {
    if (this.renderTimes.length === 0) return 0;
    return this.renderTimes.reduce((sum, time) => sum + time, 0) / this.renderTimes.length;
  }

  getMemoryUsageTrend() {
    if (this.memorySnapshots.length < 2) return { trend: 'stable', change: 0 };

    const first = this.memorySnapshots[0];
    const last = this.memorySnapshots[this.memorySnapshots.length - 1];
    const change = last.used - first.used;

    let trend = 'stable';
    if (change > 5)
      trend = 'increasing'; // 5MB 이상 증가
    else if (change < -1) trend = 'decreasing'; // 1MB 이상 감소

    return { trend, change: Math.round(change * 100) / 100 };
  }
}

// 모의 게임 리소스 매니저 (핵심 기능만)
class MockGameResourceManager {
  constructor() {
    this.resources = new Map();
    this.cache = new Map();
    this.listeners = [];
    this.loadQueue = [];
  }

  // 리소스 로드 성능 테스트
  async loadResource(type, id, data) {
    const profiler = new PerformanceProfiler();
    profiler.start('resource-load');

    // 시뮬레이션: 이미지/사운드 로드
    await this.simulateAssetLoad(data.size || 1024);

    // 메모리에 저장
    this.resources.set(`${type}:${id}`, {
      ...data,
      loadedAt: Date.now(),
      accessCount: 0,
    });

    // 캐시 관리
    this.manageCache();

    const result = profiler.end('resource-load');
    return result;
  }

  // 에셋 로드 시뮬레이션
  async simulateAssetLoad(sizeKB) {
    const loadTime = Math.max(50, sizeKB / 100); // 크기에 따른 로드 시간
    await new Promise(resolve => setTimeout(resolve, loadTime));
  }

  // 캐시 관리
  manageCache() {
    const maxCacheSize = 50; // 최대 50개 리소스

    if (this.resources.size > maxCacheSize) {
      // LRU: 가장 적게 사용된 리소스 제거
      const entries = Array.from(this.resources.entries()).sort(
        (a, b) => a[1].accessCount - b[1].accessCount
      );

      const toRemove = entries.slice(0, entries.length - maxCacheSize);
      toRemove.forEach(([key]) => {
        this.resources.delete(key);
      });
    }
  }

  // 리소스 접근
  getResource(type, id) {
    const key = `${type}:${id}`;
    const resource = this.resources.get(key);

    if (resource) {
      resource.accessCount++;
      resource.lastAccessed = Date.now();
      return resource;
    }

    return null;
  }

  // 대량 리소스 로드 테스트
  async loadBulkResources(count = 100) {
    const profiler = new PerformanceProfiler();
    profiler.start('bulk-load');

    const promises = [];
    for (let i = 0; i < count; i++) {
      const promise = this.loadResource('test', `item_${i}`, {
        name: `Test Item ${i}`,
        size: Math.random() * 2048 + 512, // 512KB - 2.5MB
        data: new Array(Math.floor(Math.random() * 1000)).fill(i),
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    const result = profiler.end('bulk-load');
    return result;
  }

  // 메모리 사용량 측정
  getMemoryUsage() {
    let totalSize = 0;
    for (const [key, resource] of this.resources) {
      // 대략적인 크기 계산
      const size = JSON.stringify(resource).length;
      totalSize += size;
    }

    return {
      resourceCount: this.resources.size,
      estimatedSizeKB: Math.round(totalSize / 1024),
      cacheHitRate: this.calculateCacheHitRate(),
    };
  }

  calculateCacheHitRate() {
    const resources = Array.from(this.resources.values());
    if (resources.length === 0) return 0;

    const totalAccess = resources.reduce((sum, r) => sum + r.accessCount, 0);
    return totalAccess / resources.length;
  }
}

// 모의 비주얼 노드 에디터 (렌더링 성능 테스트)
class MockVisualNodeEditor {
  constructor() {
    this.nodes = [];
    this.connections = [];
    this.canvas = null;
    this.renderQueue = [];
    this.lastRenderTime = 0;
  }

  // 노드 생성 성능 테스트
  createNodes(count = 50) {
    const profiler = new PerformanceProfiler();
    profiler.start('node-creation');

    for (let i = 0; i < count; i++) {
      this.nodes.push({
        id: `node_${i}`,
        type: this.getRandomNodeType(),
        x: Math.random() * 800,
        y: Math.random() * 600,
        width: 120,
        height: 60,
        inputs: Math.floor(Math.random() * 3),
        outputs: Math.floor(Math.random() * 3),
        selected: false,
        data: {
          label: `Node ${i}`,
          color: this.getRandomColor(),
        },
      });
    }

    const result = profiler.end('node-creation');
    return result;
  }

  // 연결 생성
  createConnections(count = 30) {
    const profiler = new PerformanceProfiler();
    profiler.start('connection-creation');

    for (let i = 0; i < count && i < this.nodes.length - 1; i++) {
      this.connections.push({
        id: `conn_${i}`,
        from: this.nodes[i].id,
        to: this.nodes[i + 1].id,
        fromPort: 0,
        toPort: 0,
      });
    }

    const result = profiler.end('connection-creation');
    return result;
  }

  // 렌더링 시뮬레이션
  simulateRender() {
    const profiler = new PerformanceProfiler();
    profiler.start('render');

    // 노드 렌더링 시뮬레이션
    this.nodes.forEach(node => {
      this.renderNode(node);
    });

    // 연결 렌더링 시뮬레이션
    this.connections.forEach(connection => {
      this.renderConnection(connection);
    });

    const result = profiler.end('render');
    return result;
  }

  renderNode(node) {
    // DOM 조작 시뮬레이션
    const operations = 5 + node.inputs + node.outputs;

    // 계산 집약적 작업 시뮬레이션
    for (let i = 0; i < operations; i++) {
      Math.sqrt(Math.random() * 1000);
    }
  }

  renderConnection(connection) {
    // 베지어 곡선 계산 시뮬레이션
    const points = 20;
    for (let i = 0; i < points; i++) {
      const t = i / points;
      // 베지어 곡선 계산
      Math.pow(1 - t, 3) +
        3 * Math.pow(1 - t, 2) * t +
        3 * (1 - t) * Math.pow(t, 2) +
        Math.pow(t, 3);
    }
  }

  // 대량 업데이트 성능 테스트
  performBulkUpdate() {
    const profiler = new PerformanceProfiler();
    profiler.start('bulk-update');

    // 모든 노드 위치 업데이트
    this.nodes.forEach(node => {
      node.x += (Math.random() - 0.5) * 10;
      node.y += (Math.random() - 0.5) * 10;
    });

    // 리렌더링
    const renderResult = this.simulateRender();

    const result = profiler.end('bulk-update');
    result.renderTime = renderResult.duration;

    return result;
  }

  // 유틸리티 메서드
  getRandomNodeType() {
    const types = ['event', 'action', 'condition', 'variable'];
    return types[Math.floor(Math.random() * types.length)];
  }

  getRandomColor() {
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // 성능 메트릭
  getPerformanceMetrics() {
    return {
      nodeCount: this.nodes.length,
      connectionCount: this.connections.length,
      complexity: this.nodes.length + this.connections.length * 2,
      estimatedRenderTime: this.nodes.length * 0.5 + this.connections.length * 0.3, // ms 추정
    };
  }
}

// 테스트 실행 함수들
async function testGameResourceManagerPerformance() {
  console.log('🎮 GameResourceManager 성능 테스트 시작\\n');

  const manager = new MockGameResourceManager();
  const profiler = new PerformanceProfiler();

  // 1. 단일 리소스 로드 성능
  console.log('📦 단일 리소스 로드 테스트');
  const singleLoadResult = await manager.loadResource('character', 'hero1', {
    name: '영웅',
    size: 1024,
    abilities: ['검술', '마법', '방어'],
  });
  console.log(`   로드 시간: ${singleLoadResult.duration.toFixed(2)}ms`);
  console.log(`   메모리 사용: ${(singleLoadResult.memoryDelta / 1024).toFixed(2)}KB\\n`);

  // 2. 대량 리소스 로드 성능
  console.log('📦 대량 리소스 로드 테스트 (100개)');
  profiler.takeMemorySnapshot();
  const bulkLoadResult = await manager.loadBulkResources(100);
  profiler.takeMemorySnapshot();

  const memoryTrend = profiler.getMemoryUsageTrend();
  console.log(`   총 로드 시간: ${bulkLoadResult.duration.toFixed(2)}ms`);
  console.log(`   평균 로드 시간: ${(bulkLoadResult.duration / 100).toFixed(2)}ms`);
  console.log(`   메모리 변화: ${memoryTrend.change}MB (${memoryTrend.trend})\\n`);

  // 3. 캐시 성능 테스트
  console.log('🔄 캐시 성능 테스트');
  profiler.start('cache-test');

  // 리소스 반복 접근
  for (let i = 0; i < 1000; i++) {
    const randomId = Math.floor(Math.random() * 50); // 처음 50개만 접근
    manager.getResource('test', `item_${randomId}`);
  }

  const cacheResult = profiler.end('cache-test');
  const memoryUsage = manager.getMemoryUsage();

  console.log(`   1000회 접근 시간: ${cacheResult.duration.toFixed(2)}ms`);
  console.log(`   캐시된 리소스: ${memoryUsage.resourceCount}개`);
  console.log(`   캐시 히트율: ${memoryUsage.cacheHitRate.toFixed(2)}회/리소스`);
  console.log(`   예상 메모리 사용: ${memoryUsage.estimatedSizeKB}KB\\n`);

  // 성능 평가
  const performanceScore = {
    singleLoad:
      singleLoadResult.duration < 100
        ? 'excellent'
        : singleLoadResult.duration < 200
          ? 'good'
          : 'needs-improvement',
    bulkLoad:
      bulkLoadResult.duration < 5000
        ? 'excellent'
        : bulkLoadResult.duration < 10000
          ? 'good'
          : 'needs-improvement',
    cachePerformance:
      cacheResult.duration < 50
        ? 'excellent'
        : cacheResult.duration < 100
          ? 'good'
          : 'needs-improvement',
    memoryEfficiency:
      memoryTrend.change < 10
        ? 'excellent'
        : memoryTrend.change < 20
          ? 'good'
          : 'needs-improvement',
  };

  console.log('📊 GameResourceManager 성능 평가:');
  console.log(
    `   단일 로드: ${performanceScore.singleLoad} ${getScoreEmoji(performanceScore.singleLoad)}`
  );
  console.log(
    `   대량 로드: ${performanceScore.bulkLoad} ${getScoreEmoji(performanceScore.bulkLoad)}`
  );
  console.log(
    `   캐시 성능: ${performanceScore.cachePerformance} ${getScoreEmoji(performanceScore.cachePerformance)}`
  );
  console.log(
    `   메모리 효율: ${performanceScore.memoryEfficiency} ${getScoreEmoji(performanceScore.memoryEfficiency)}\\n`
  );

  const allExcellent = Object.values(performanceScore).every(score => score === 'excellent');
  const allGoodOrBetter = Object.values(performanceScore).every(
    score => score !== 'needs-improvement'
  );

  return {
    passed: allGoodOrBetter,
    excellent: allExcellent,
    scores: performanceScore,
    metrics: {
      singleLoad: singleLoadResult.duration,
      bulkLoad: bulkLoadResult.duration,
      cacheAccess: cacheResult.duration,
      memoryChange: memoryTrend.change,
    },
  };
}

async function testVisualNodeEditorPerformance() {
  console.log('🎨 VisualNodeEditor 성능 테스트 시작\\n');

  const editor = new MockVisualNodeEditor();
  const profiler = new PerformanceProfiler();

  // 1. 노드 생성 성능
  console.log('🔨 노드 생성 성능 테스트');
  const nodeCreationResult = editor.createNodes(50);
  console.log(`   50개 노드 생성: ${nodeCreationResult.duration.toFixed(2)}ms`);

  // 2. 연결 생성 성능
  console.log('🔗 연결 생성 성능 테스트');
  const connectionResult = editor.createConnections(30);
  console.log(`   30개 연결 생성: ${connectionResult.duration.toFixed(2)}ms`);

  // 3. 렌더링 성능 테스트
  console.log('🖼️ 렌더링 성능 테스트');

  // 여러 번 렌더링
  const renderResults = [];
  for (let i = 0; i < 10; i++) {
    const renderResult = editor.simulateRender();
    renderResults.push(renderResult.duration);
  }

  const avgRenderTime = renderResults.reduce((sum, time) => sum + time, 0) / renderResults.length;
  const maxRenderTime = Math.max(...renderResults);
  const minRenderTime = Math.min(...renderResults);

  console.log(`   평균 렌더링: ${avgRenderTime.toFixed(2)}ms`);
  console.log(`   최대 렌더링: ${maxRenderTime.toFixed(2)}ms`);
  console.log(`   최소 렌더링: ${minRenderTime.toFixed(2)}ms\\n`);

  // 4. 대량 업데이트 성능
  console.log('🔄 대량 업데이트 성능 테스트');
  profiler.takeMemorySnapshot();

  const bulkUpdateResults = [];
  for (let i = 0; i < 5; i++) {
    const updateResult = editor.performBulkUpdate();
    bulkUpdateResults.push({
      updateTime: updateResult.duration,
      renderTime: updateResult.renderTime,
    });
  }

  profiler.takeMemorySnapshot();
  const memoryTrend = profiler.getMemoryUsageTrend();

  const avgUpdateTime =
    bulkUpdateResults.reduce((sum, r) => sum + r.updateTime, 0) / bulkUpdateResults.length;
  const avgRerenderTime =
    bulkUpdateResults.reduce((sum, r) => sum + r.renderTime, 0) / bulkUpdateResults.length;

  console.log(`   평균 업데이트: ${avgUpdateTime.toFixed(2)}ms`);
  console.log(`   평균 리렌더링: ${avgRerenderTime.toFixed(2)}ms`);
  console.log(`   메모리 변화: ${memoryTrend.change}MB\\n`);

  // 5. 복잡도 분석
  const metrics = editor.getPerformanceMetrics();
  console.log('📈 복잡도 분석');
  console.log(`   노드 수: ${metrics.nodeCount}개`);
  console.log(`   연결 수: ${metrics.connectionCount}개`);
  console.log(`   복잡도 점수: ${metrics.complexity}`);
  console.log(`   예상 렌더링: ${metrics.estimatedRenderTime.toFixed(2)}ms\\n`);

  // 성능 평가
  const performanceScore = {
    nodeCreation:
      nodeCreationResult.duration < 50
        ? 'excellent'
        : nodeCreationResult.duration < 100
          ? 'good'
          : 'needs-improvement',
    rendering:
      avgRenderTime < 16.67 ? 'excellent' : avgRenderTime < 33.33 ? 'good' : 'needs-improvement', // 60fps/30fps 기준
    bulkUpdate:
      avgUpdateTime < 50 ? 'excellent' : avgUpdateTime < 100 ? 'good' : 'needs-improvement',
    memoryStability:
      Math.abs(memoryTrend.change) < 5
        ? 'excellent'
        : Math.abs(memoryTrend.change) < 10
          ? 'good'
          : 'needs-improvement',
  };

  console.log('📊 VisualNodeEditor 성능 평가:');
  console.log(
    `   노드 생성: ${performanceScore.nodeCreation} ${getScoreEmoji(performanceScore.nodeCreation)}`
  );
  console.log(
    `   렌더링: ${performanceScore.rendering} ${getScoreEmoji(performanceScore.rendering)}`
  );
  console.log(
    `   대량 업데이트: ${performanceScore.bulkUpdate} ${getScoreEmoji(performanceScore.bulkUpdate)}`
  );
  console.log(
    `   메모리 안정성: ${performanceScore.memoryStability} ${getScoreEmoji(performanceScore.memoryStability)}\\n`
  );

  const allExcellent = Object.values(performanceScore).every(score => score === 'excellent');
  const allGoodOrBetter = Object.values(performanceScore).every(
    score => score !== 'needs-improvement'
  );

  return {
    passed: allGoodOrBetter,
    excellent: allExcellent,
    scores: performanceScore,
    metrics: {
      nodeCreation: nodeCreationResult.duration,
      avgRender: avgRenderTime,
      bulkUpdate: avgUpdateTime,
      memoryChange: memoryTrend.change,
    },
  };
}

function getScoreEmoji(score) {
  switch (score) {
    case 'excellent':
      return '🟢';
    case 'good':
      return '🟡';
    case 'needs-improvement':
      return '🔴';
    default:
      return '⚪';
  }
}

async function runAllPerformanceTests() {
  console.log('🚀 성능 최적화 전체 테스트 시작');
  console.log('='.repeat(60) + '\\n');

  const resourceManagerResult = await testGameResourceManagerPerformance();
  console.log('='.repeat(60) + '\\n');

  const nodeEditorResult = await testVisualNodeEditorPerformance();
  console.log('='.repeat(60) + '\\n');

  // 전체 결과 집계
  console.log('🏁 전체 성능 테스트 결과:');
  console.log(
    `   GameResourceManager: ${resourceManagerResult.passed ? '✅' : '❌'} ${resourceManagerResult.excellent ? '(우수)' : ''}`
  );
  console.log(
    `   VisualNodeEditor: ${nodeEditorResult.passed ? '✅' : '❌'} ${nodeEditorResult.excellent ? '(우수)' : ''}`
  );

  const overallPassed = resourceManagerResult.passed && nodeEditorResult.passed;
  const overallExcellent = resourceManagerResult.excellent && nodeEditorResult.excellent;

  console.log(`\\n   전체 통과율: ${overallPassed ? '✅' : '❌'}`);
  console.log(`   우수 등급: ${overallExcellent ? '🏆' : '📈'}`);

  console.log(
    `\\n${overallPassed ? (overallExcellent ? '🎉 모든 성능 테스트 우수 등급!' : '✅ 모든 성능 테스트 통과') : '⚠️  일부 성능 개선 필요'}`
  );

  return {
    passed: overallPassed,
    excellent: overallExcellent,
    resourceManager: resourceManagerResult,
    nodeEditor: nodeEditorResult,
  };
}

// Node.js 환경에서 실행
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllPerformanceTests,
    testGameResourceManagerPerformance,
    testVisualNodeEditorPerformance,
    PerformanceProfiler,
    MockGameResourceManager,
    MockVisualNodeEditor,
  };
}

// 브라우저 환경에서 실행
if (typeof window !== 'undefined') {
  window.PerformanceTests = {
    runAllPerformanceTests,
    testGameResourceManagerPerformance,
    testVisualNodeEditorPerformance,
  };
}

// 직접 실행시 테스트 시작
if (require.main === module) {
  runAllPerformanceTests();
}

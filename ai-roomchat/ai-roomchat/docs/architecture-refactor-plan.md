# 🏗️ Architecture Refactor Plan

## Current State Analysis

### API Routes (159+ endpoints)

- `/api/rank/*` - 게임 코어 로직 (40+ endpoints)
- `/api/admin/*` - 관리자 기능
- `/api/maker/*` - 프롬프트 제작
- `/api/chat/*` - 채팅/AI 프록시
- `/api/messages/*` - 메시징
- `/api/content/*` - 컨텐츠 관리
- `/api/errors/*` - 에러 리포팅
- `/api/arena/*` - 아레나 기능

### Pages

- Rank game UI
- Maker (prompt creation)
- Lobby/Roster
- Character management
- Admin portal
- Arena
- Chat

### Shared Libraries (`lib/`)

- `rank/` - Rank game utilities
- `maker/` - Maker tools
- `promptEngine/` - Prompt processing
- `heroes/`, `audio/`, `chat/` - Domain modules
- `supabase*` - DB clients
- `utils/` - Common utilities

### Module Layer (`modules/`)

- `rank/` - Rank business logic
- `arena/` - Arena logic
- `character/` - Character management
- `auth/` - Authentication

---

## 🎯 Target Architecture

### Single Installable App with Feature Flags

```
starbase/
├── packages/
│   ├── core/              # 공유 코드 (설치 시 필수)
│   │   ├── lib/
│   │   ├── utils/
│   │   └── types/
│   │
│   ├── features/          # 기능별 모듈 (선택적 활성화)
│   │   ├── rank/          # ✅ Rank game
│   │   ├── maker/         # ✅ Prompt maker
│   │   ├── arena/         # ✅ Arena
│   │   ├── chat/          # ✅ Chat
│   │   └── admin/         # ✅ Admin
│   │
│   └── app/               # Main Next.js app
│       ├── pages/
│       ├── components/
│       └── config/features.js  # Feature flags
│
├── config/
│   ├── features.example.json   # 기능 활성화 설정
│   └── deployment.example.json # 배포 설정
│
└── scripts/
    ├── install.js         # 설치 스크립트
    └── setup-features.js  # 기능 선택 CLI
```

---

## 📦 Refactor Steps

### Phase 1: Core Extraction (Week 1)

- [ ] `@starbase/core` 패키지 생성
  - supabase clients
  - auth helpers
  - common utils
  - type definitions

### Phase 2: Feature Modules (Week 2-3)

- [ ] `@starbase/feature-rank` 독립 모듈화
- [ ] `@starbase/feature-maker` 독립 모듈화
- [ ] `@starbase/feature-admin` 독립 모듈화
- [ ] `@starbase/feature-arena` 독립 모듈화

### Phase 3: Plugin System (Week 4)

- [ ] Feature registry 구현
- [ ] Dynamic route loading
- [ ] Config-based activation

### Phase 4: Installation Flow (Week 5)

- [ ] Interactive setup CLI
- [ ] Docker Compose 지원
- [ ] One-click deploy scripts

---

## 🔧 Immediate Improvements

### 1. Config-Driven Features

```javascript
// config/features.js
export const FEATURES = {
  rank: process.env.FEATURE_RANK !== 'false',
  maker: process.env.FEATURE_MAKER !== 'false',
  admin: process.env.FEATURE_ADMIN !== 'false',
  arena: process.env.FEATURE_ARENA !== 'false',
  chat: process.env.FEATURE_CHAT !== 'false',
};
```

### 2. Modular API Routes

```javascript
// pages/api/[...proxy].js
import { FEATURES } from '@/config/features';
import { createRouter } from '@/lib/router';

const router = createRouter();

if (FEATURES.rank) router.use('/rank', rankRoutes);
if (FEATURES.maker) router.use('/maker', makerRoutes);
// ...
```

### 3. Dynamic Pages

```javascript
// pages/rank/index.js
import { FEATURES } from '@/config/features';

export async function getStaticProps() {
  if (!FEATURES.rank) {
    return { notFound: true };
  }
  return { props: {} };
}
```

---

## 🚀 Benefits

1. **설치 간소화**: npm install → setup wizard → 완료
2. **리소스 절약**: 필요한 기능만 활성화
3. **확장성**: 새 기능을 플러그인처럼 추가
4. **유지보수**: 기능별 독립 개발/테스트
5. **커스터마이징**: 사용자가 원하는 조합 선택

---

## 🎬 Next Actions

1. Core 패키지 분리 시작
2. Feature flags 기본 구조 구현
3. Rank 모듈 독립화 (가장 큰 모듈이라 먼저)
4. 점진적 마이그레이션

---

_Generated: 2025-10-22_

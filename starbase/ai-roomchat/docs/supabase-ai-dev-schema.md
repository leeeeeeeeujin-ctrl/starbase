# 📊 Starbase AI Roomchat - 수퍼베이스 데이터베이스 스키마 문서

## 🎯 개요
이 문서는 Starbase AI Roomchat 애플리케이션의 Supabase 데이터베이스 구조와 AI 개발 환경을 위한 필요 테이블들을 정의합니다.

## 📁 SQL 파일 구조

### 🔧 메인 스키마 파일들
- `supabase.sql` - 메인 데이터베이스 스키마 (8730+ 라인)
- `supabase_social.sql` - 소셜 기능 관련 테이블
- `supabase_chat.sql` - 채팅 시스템 테이블  
- `supabase-realtime-triggers.sql` - 실시간 트리거 설정
- `supabase-test-tables.sql` - 테스트용 테이블

### 📚 문서화된 스키마들
- `docs/supabase-rank-schema.sql` - 랭킹 시스템 스키마 문서
- `docs/supabase-rank-backend-upgrades.sql` - 백엔드 업그레이드 내역

### ⚡ 특화 기능 SQL들 (`docs/sql/` 디렉토리)
- `matchmaking-functions.sql` - 매치메이킹 로직
- `realtime-matchmaking.sql` - 실시간 매치메이킹
- `rank-session-timeline-events.sql` - 게임 세션 타임라인
- `register-rank-game.sql` - 게임 등록 시스템
- 기타 20+ 개의 특화 함수들

## 🎮 AI 개발 환경을 위한 새로운 테이블 설계

### 1. 🤖 AI API 관리 테이블
```sql
-- AI API 키 관리 (사용자별)
CREATE TABLE IF NOT EXISTS public.ai_api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'cohere', 'local'
  model_name TEXT NOT NULL, -- 'gpt-4', 'claude-3-opus', etc.
  api_key_encrypted TEXT NOT NULL, -- 암호화된 API 키
  endpoint_url TEXT, -- 커스텀 엔드포인트 (로컬서버 등)
  enabled BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  test_status TEXT DEFAULT 'pending', -- 'success', 'failed', 'pending'
  test_error_message TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, provider, model_name)
);
```

### 2. 🎮 게임 프로젝트 관리 테이블  
```sql
-- 사용자 게임 프로젝트
CREATE TABLE IF NOT EXISTS public.game_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  project_type TEXT DEFAULT 'text_game', -- 'text_game', 'battle_game', 'puzzle_game'
  
  -- 프로젝트 설정
  settings JSONB DEFAULT '{}'::jsonb, -- 게임 규칙, 설정 등
  variables JSONB DEFAULT '{}'::jsonb, -- 게임 변수들
  
  -- 파일 관리
  files JSONB DEFAULT '[]'::jsonb, -- 프로젝트 내 파일 목록
  
  -- 점수 시스템 (FlexibleGameEngine 연동)
  score_rules JSONB DEFAULT '{}'::jsonb, -- 점수 규칙 정의
  end_conditions JSONB DEFAULT '{}'::jsonb, -- 게임 종료 조건
  
  -- 메타데이터
  is_public BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. 📁 프로젝트 파일 관리 테이블
```sql
-- 프로젝트 파일들 (코드, 설정 등)
CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.game_projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, -- 'src/main.js', 'config/game.json' 등
  file_type TEXT NOT NULL, -- 'javascript', 'python', 'sql', 'json'
  content TEXT NOT NULL,
  
  -- 버전 관리
  version INTEGER DEFAULT 1,
  parent_version_id UUID REFERENCES public.project_files(id),
  
  -- 메타데이터
  size_bytes INTEGER DEFAULT 0,
  last_modified_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, file_path, version)
);
```

### 4. 🎯 게임 세션 및 점수 관리 테이블
```sql
-- 게임 세션 (FlexibleGameEngine 연동)
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.game_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 게임 상태
  status TEXT DEFAULT 'waiting', -- 'waiting', 'active', 'paused', 'finished'
  current_score INTEGER DEFAULT 0,
  session_data JSONB DEFAULT '{}'::jsonb, -- 세션별 임시 데이터
  persistent_data JSONB DEFAULT '{}'::jsonb, -- 영구 저장 데이터
  
  -- 시간 정보
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- 결과 정보
  final_score INTEGER,
  result TEXT, -- 'win', 'lose', 'draw', 'quit'
  end_reason TEXT, -- 'completion', 'timeout', 'manual'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 점수 변동 기록
CREATE TABLE IF NOT EXISTS public.score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL, -- 'win', 'lose', 'bonus', 'penalty', etc.
  score_change INTEGER NOT NULL,
  old_score INTEGER NOT NULL,
  new_score INTEGER NOT NULL,
  reason TEXT,
  
  -- 이벤트 데이터
  event_data JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. 🔄 AI 작업 로그 테이블
```sql
-- AI 코드 도우미 사용 로그
CREATE TABLE IF NOT EXISTS public.ai_assistant_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.game_projects(id) ON DELETE SET NULL,
  
  -- 요청 정보
  provider TEXT NOT NULL, -- 사용된 AI 제공업체
  model_name TEXT NOT NULL,
  programming_language TEXT NOT NULL, -- 'javascript', 'python', etc.
  
  -- 대화 내용
  user_message TEXT NOT NULL,
  ai_response TEXT,
  generated_code TEXT,
  
  -- 실행 결과 (JavaScript의 경우)
  execution_success BOOLEAN,
  execution_result TEXT,
  execution_error TEXT,
  
  -- 메타데이터
  response_time_ms INTEGER,
  tokens_used INTEGER,
  cost_estimate NUMERIC(10,6), -- 예상 비용 (달러)
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6. 📦 패키지 및 라이브러리 관리 테이블
```sql
-- 사용자가 다운로드한 개발 패키지들
CREATE TABLE IF NOT EXISTS public.user_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  package_name TEXT NOT NULL, -- 'react', 'express', 'pandas', etc.
  package_type TEXT NOT NULL, -- 'npm', 'pip', 'custom'
  version TEXT DEFAULT 'latest',
  
  -- 패키지 데이터 (하이브리드 앱용)
  package_data BYTEA, -- 압축된 패키지 파일들
  package_size_bytes INTEGER,
  
  -- 설치 정보
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  
  -- 메타데이터
  description TEXT,
  dependencies JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, package_name, package_type)
);
```

## 🔐 Row Level Security (RLS) 정책

### AI API 관리 테이블 보안
```sql
-- AI API 설정은 소유자만 접근
ALTER TABLE public.ai_api_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_api_configs_owner_only ON public.ai_api_configs
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### 게임 프로젝트 보안  
```sql
-- 게임 프로젝트는 소유자 또는 공개 프로젝트만 조회 가능
ALTER TABLE public.game_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_projects_select ON public.game_projects
FOR SELECT USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY game_projects_owner_only ON public.game_projects
FOR INSERT, UPDATE, DELETE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

## 🚀 필수 함수들

### 1. 암호화/복호화 함수
```sql
-- API 키 암호화 함수 (서버 사이드)
CREATE OR REPLACE FUNCTION encrypt_api_key(api_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- pgcrypto를 사용한 암호화 로직
  RETURN encode(
    pgp_sym_encrypt(api_key, current_setting('app.encryption_key')),
    'base64'
  );
END;
$$;

-- API 키 복호화 함수 (서버 사이드)  
CREATE OR REPLACE FUNCTION decrypt_api_key(encrypted_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    decode(encrypted_key, 'base64'),
    current_setting('app.encryption_key')
  );
END;
$$;
```

### 2. 프로젝트 관리 함수
```sql
-- 새 게임 프로젝트 생성
CREATE OR REPLACE FUNCTION create_game_project(
  project_name TEXT,
  project_type TEXT DEFAULT 'text_game',
  initial_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_project_id UUID;
BEGIN
  -- 프로젝트 생성
  INSERT INTO public.game_projects (user_id, name, project_type, settings)
  VALUES (auth.uid(), project_name, project_type, initial_settings)
  RETURNING id INTO new_project_id;
  
  -- 기본 파일 생성 (템플릿 기반)
  INSERT INTO public.project_files (project_id, file_path, file_type, content)
  VALUES 
    (new_project_id, 'README.md', 'markdown', '# ' || project_name || E'\n\n게임 프로젝트입니다.'),
    (new_project_id, 'src/main.js', 'javascript', '// 메인 게임 로직\nconsole.log("게임 시작!");'),
    (new_project_id, 'config/game.json', 'json', '{"name": "' || project_name || '", "version": "1.0.0"}');
  
  RETURN new_project_id;
END;
$$;
```

### 3. 게임 세션 관리 함수
```sql
-- 게임 세션 시작
CREATE OR REPLACE FUNCTION start_game_session(
  p_project_id UUID,
  initial_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_session_id UUID;
BEGIN
  INSERT INTO public.game_sessions (
    project_id,
    user_id,
    status,
    session_data,
    started_at
  )
  VALUES (
    p_project_id,
    auth.uid(),
    'active',
    initial_data,
    NOW()
  )
  RETURNING id INTO new_session_id;
  
  RETURN new_session_id;
END;
$$;

-- 점수 업데이트 함수
CREATE OR REPLACE FUNCTION update_game_score(
  p_session_id UUID,
  p_event_type TEXT,
  p_score_change INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_score INTEGER;
  v_new_score INTEGER;
  result JSONB;
BEGIN
  -- 현재 점수 가져오기
  SELECT current_score INTO v_old_score
  FROM public.game_sessions
  WHERE id = p_session_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;
  
  -- 새 점수 계산
  v_new_score := v_old_score + p_score_change;
  
  -- 세션 점수 업데이트
  UPDATE public.game_sessions
  SET current_score = v_new_score,
      updated_at = NOW()
  WHERE id = p_session_id;
  
  -- 점수 변동 로그 기록
  INSERT INTO public.score_events (
    session_id,
    event_type,
    score_change,
    old_score,
    new_score,
    reason
  )
  VALUES (
    p_session_id,
    p_event_type,
    p_score_change,
    v_old_score,
    v_new_score,
    p_reason
  );
  
  -- 결과 반환
  result := jsonb_build_object(
    'session_id', p_session_id,
    'old_score', v_old_score,
    'new_score', v_new_score,
    'change', p_score_change,
    'event_type', p_event_type
  );
  
  RETURN result;
END;
$$;
```

## 📊 인덱스 최적화

```sql
-- 성능 최적화를 위한 인덱스들
CREATE INDEX IF NOT EXISTS idx_game_projects_user_public 
ON public.game_projects (user_id, is_public, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_files_project_type 
ON public.project_files (project_id, file_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_sessions_user_status 
ON public.game_sessions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_score_events_session_time 
ON public.score_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_logs_user_time 
ON public.ai_assistant_logs (user_id, created_at DESC);
```

## 🎯 구현 완료 및 테스트

### ✅ 완료된 기능들

1. **✅ 1단계**: 기본 테이블 생성 및 RLS 설정 완료
   - `ai_api_configs` - AI API 관리 테이블
   - `game_projects` - 게임 프로젝트 관리 테이블
   - `project_files` - 프로젝트 파일 관리 테이블
   - `game_sessions` - 게임 세션 및 점수 관리 테이블
   - `score_events` - 점수 변동 기록 테이블
   - `ai_assistant_logs` - AI 도우미 사용 로그 테이블
   - `user_packages` - 패키지 관리 테이블

2. **✅ 2단계**: AI API 관리 시스템 연동 완료
   - `AIApiManager.js` - AI API 관리 UI
   - `SecureApiManager` - 암호화 시스템
   - 데이터베이스 연동 함수들

3. **✅ 3단계**: 게임 프로젝트 CRUD 구현 완료
   - `GameDatabaseService.js` - 완전한 데이터베이스 서비스
   - 프로젝트 생성/조회/업데이트/삭제 기능
   - 파일 관리 시스템 포함

4. **✅ 4단계**: FlexibleGameEngine 데이터베이스 연동 완료
   - 게임 세션 자동 관리
   - 실시간 점수 동기화
   - 영구 데이터 저장/로드
   - 게임 변수 관리

5. **✅ 5단계**: 실시간 기능 구현 완료
   - 게임 세션 실시간 구독
   - 점수 이벤트 실시간 알림
   - 프로젝트 파일 변경 감지

6. **✅ 6단계**: 통합 데모 시스템 완료
   - `AIGameDevDemo.js` - 완전한 테스트 인터페이스
   - 모든 기능 통합 테스트 가능

### 🚀 사용 방법

#### 1. 데이터베이스 스키마 생성
```sql
-- docs/sql/ai-dev-environment-schema.sql 실행
```

#### 2. FlexibleGameEngine 사용 예시
```javascript
import { GameFactory } from '../components/game/FlexibleGameEngine'

// 프로젝트 기반 게임 생성
const engine = await GameFactory.createFromProject('project-id', 'user-id')

// 게임 시작
await engine.startGame({ playerName: 'Developer' })

// 점수 업데이트 (자동 DB 동기화)
await engine.updateScore('win', null, '퀘스트 완료')

// 게임 종료
await engine.endGame('completion', { score: 1000 })
```

#### 3. 데이터베이스 서비스 사용 예시
```javascript
import GameDatabaseService from '../services/GameDatabaseService'

// 프로젝트 생성
const project = await GameDatabaseService.createProject({
  name: 'My Game',
  type: 'text_game'
})

// 세션 시작
const session = await GameDatabaseService.startGameSession(project.projectId)

// 점수 업데이트
await GameDatabaseService.updateScore(session.sessionId, 'win', 100)
```

#### 4. AI API 관리 사용 예시
```javascript
import { AIApiManager } from '../components/common/AIApiManager'

// 컴포넌트에서 사용
<AIApiManager 
  onConfigUpdate={(configs) => console.log('API 설정 변경:', configs)}
  showConnectionStatus={true}
/>
```

### 🎮 데모 페이지 실행

1. `components/common/AIGameDevDemo.js` 컴포넌트를 페이지에 추가
2. 브라우저에서 접속하여 모든 기능 테스트 가능:
   - 게임 엔진 생성
   - 데이터베이스 연동 테스트
   - 점수 시스템 검증
   - 실시간 동기화 확인

### 🔧 환경 설정

1. **수퍼베이스 환경변수**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

2. **암호화 키 설정** (선택사항):
   ```env
   ENCRYPTION_KEY=your-32-char-encryption-key
   ```

### 📊 모니터링 및 디버깅

- **게임 세션 로그**: `ai_assistant_logs` 테이블에서 확인
- **점수 변동 기록**: `score_events` 테이블에서 추적
- **실시간 이벤트**: 브라우저 개발자 도구에서 확인
- **데이터베이스 상태**: 수퍼베이스 대시보드에서 모니터링

## 🎯 완전 통합된 AI 개발 환경 완성! 🚀

이제 사용자는 다음을 모두 할 수 있습니다:

1. **🤖 AI API 관리**: 5개 제공업체 지원, 암호화된 키 저장
2. **🎮 게임 개발**: 유연한 게임 엔진으로 다양한 게임 타입 지원  
3. **💾 데이터베이스 연동**: 자동 세션 관리, 실시간 동기화
4. **📁 프로젝트 관리**: 파일 시스템, 버전 관리
5. **📊 통계 및 분석**: 상세한 게임 플레이 데이터
6. **🔄 실시간 협업**: 멀티플레이어 지원 준비

**모든 시스템이 완전히 통합되어 프로덕션 준비 완료!** ✨
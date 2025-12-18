// Text Battle AI 응답 계약 파서
//
// 역할:
// - LLM이 반환한 텍스트(aiResponse)를 텍스트 배틀용 구조체로 변환한다.
// - 레거시 포맷(**서술**/**결과**/...)과 신규 포맷(응답/이번 응답의 주역/만족된 변수명/캐릭터 결과)을 모두 지원한다.
//
// 이 모듈은 "프롬프트/응답 계약 레이어"로서,
// pages/api/ai-battle-judge.js 뿐 아니라 다른 게임/장르에서도 같은 포맷을 재사용할 수 있도록 분리되어 있다.

export function parseAIResponse(aiResponse) {
  try {
    const text = typeof aiResponse === 'string' ? aiResponse : String(aiResponse ?? '');
    const rawLines = text.split(/\r?\n/);
    const trimmedLines = rawLines.map((l) => l.trim()).filter(Boolean);

    const normalize = (line) =>
      String(line || '')
        .replace(/\s+/g, '')
        .replace(/[：:]/g, ':')
        .toLowerCase();

    const hasMarker = (line, key) => normalize(line).includes(key);

    const base = {
      narrative: '',
      result: 'continue',
      effects: null,
      battleEnd: false,
      winner: null,
      formatOk: false,
    };

    // -------------------------------------------------------------------
    // 1) 레거시 포맷(**서술** / **결과** / **배틀종료** / **승자** / **효과**)
    // -------------------------------------------------------------------
    const hasLegacyMarkers = trimmedLines.some(
      (l) => l.includes('**서술**:') || l.includes('**결과**:'),
    );

    if (hasLegacyMarkers) {
      const parsed = { ...base };

      trimmedLines.forEach((line) => {
        if (line.includes('**서술**:')) {
          parsed.narrative = line.replace('**서술**:', '').trim();
        } else if (line.includes('**결과**:')) {
          const result = line.replace('**결과**:', '').trim().toLowerCase();
          parsed.result = ['success', 'partial', 'failure', 'critical'].includes(result)
            ? result
            : 'continue';
        } else if (line.includes('**배틀종료**:')) {
          parsed.battleEnd = line.toLowerCase().includes('true');
        } else if (line.includes('**승자**:')) {
          const winner = line.replace('**승자**:', '').trim();
          parsed.winner = winner !== '없음' && winner !== '' ? winner : null;
        } else if (line.includes('**효과**:')) {
          const effect = line.replace('**효과**:', '').trim();
          if (effect && effect !== '없음') {
            parsed.effects = { description: effect };
          }
        }
      });

      parsed.formatOk = true;
      return parsed;
    }

    // -------------------------------------------------------------------
    // 2) 새 포맷 (응답 / 이번 응답의 주역 / 만족된 변수명 / 캐릭터 결과)
    // -------------------------------------------------------------------
    const hasNewMarkers = trimmedLines.some(
      (l) =>
        hasMarker(l, '이번응답의주역') ||
        hasMarker(l, '만족된변수명') ||
        hasMarker(l, '캐릭터결과'),
    );

    if (hasNewMarkers) {
      const parsed = {
        ...base,
        actor: null,
        satisfiedVars: [],
        characterResults: {},
      };

      // 내레이션: "응답:" 줄 이후 ~ 메타 섹션 직전까지
      const idxResponse = rawLines.findIndex((l) => normalize(l).startsWith('응답:'));
      if (idxResponse >= 0) {
        const narrativeLines = [];
        const first = rawLines[idxResponse];
        const firstBody = first.split('응답:')[1];
        if (firstBody && firstBody.trim()) {
          narrativeLines.push(firstBody.trim());
        }

        for (let i = idxResponse + 1; i < rawLines.length; i++) {
          const t = rawLines[i].trim();
          if (
            t.startsWith('이번 응답의 주역:') ||
            t.startsWith('만족된 변수명:') ||
            t.startsWith('캐릭터 결과:')
          ) {
            break;
          }
          if (/^-{5,}$/.test(t)) {
            // 구분선은 내레이션에 포함하지 않는다
            continue;
          }
          narrativeLines.push(rawLines[i]);
        }

        parsed.narrative = narrativeLines.join('\n').trim();
      } else {
        // "응답:" 헤더가 없으면 전체를 내레이션으로 취급
        parsed.narrative = text.trim();
      }

      // 메타 정보 파싱
      rawLines.forEach((lineRaw) => {
        const line = lineRaw.trim();
        const norm = normalize(line);

        if (norm.includes('이번응답의주역')) {
          const value = lineRaw.split(':').slice(1).join(':');
          parsed.actor = value ? value.trim() || null : null;
        } else if (norm.includes('만족된변수명')) {
          const value = lineRaw.split(':').slice(1).join(':');
          if (value) {
            const v = value.trim();
            if (v && v !== '없음') {
              parsed.satisfiedVars = v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            }
          }
        } else if (norm.includes('캐릭터결과')) {
          const value = lineRaw.split(':').slice(1).join(':');
          if (value) {
            const v = value.trim();
            if (v && v !== '없음') {
              const pairs = v.split(',').map((s) => s.trim()).filter(Boolean);
              const statusMap = {};
              pairs.forEach((p) => {
                const [id, status] = p.split('=').map((s) => s.trim());
                if (!id || !status) return;
                statusMap[id] = status;
              });
              parsed.characterResults = statusMap;

              const heroStatus = statusMap.hero || null;
              const rivalStatus = statusMap.rival || null;

              if (heroStatus === 'win' && rivalStatus !== 'win') {
                parsed.winner = 'hero';
              } else if (rivalStatus === 'win' && heroStatus !== 'win') {
                parsed.winner = 'rival';
              } else {
                parsed.winner = null;
              }

              const hasTerminal = Object.values(statusMap).some(
                (s) => s === 'win' || s === 'out',
              );
              parsed.battleEnd = hasTerminal;

              if (parsed.winner && parsed.result === 'continue') {
                parsed.result = 'success';
              }
            }
          }
        }
      });

      parsed.formatOk = true;
      return parsed;
    }

    // -------------------------------------------------------------------
    // 3) 어떤 포맷에도 맞지 않을 경우: 전체 텍스트를 내레이션으로 사용
    // -------------------------------------------------------------------
    return {
      ...base,
      narrative: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
    };
  } catch (error) {
    // 파싱 실패 시 기본값 반환
    const safe = typeof aiResponse === 'string' ? aiResponse : String(aiResponse ?? '');
    return {
      narrative: safe.substring(0, 200) + (safe.length > 200 ? '...' : ''),
      result: 'continue',
      effects: null,
      battleEnd: false,
      winner: null,
      formatOk: false,
    };
  }
}


# AI 프롬프트 템플릿(샘플)

## 배틀 판정(1v1)
```
[심판 규칙]
- 공평성 유지, 캐릭터 능력(ability1..4)와 역할(role) 반영
- 출력: 승자 아이디(characterId)와 간단한 코멘트

[입력]
- A: {{character.name}} ({{character.role}}) vs B: {{opponent.name}} ({{opponent.role}})

[요청]
- JSON만 출력: { "winner": "characterId", "comment": "..." }
```

## 내러티브 진행
```
장면 설명을 1~2문장으로 요약하고, 다음 행동 대안을 2개 제시.
캐릭터: {{character.name}}
현재 점수: {{character.score}}
```

## 비공개 힌트(특정 슬롯/플레이어 전용)
```
[히든 힌트]
- 이 힌트는 {{character.name}}만 볼 수 있음.
- 플레이 팁 1개.
```

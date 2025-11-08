# 레퍼런스 데이터 키

HTTP 경로: `/api/reference/*` (로컬: `ai-roomchat/docs/reference_data`)

키 → 상대 경로(예시)
- `character.sample` → `characters/character.sample.json`
- `characters.min` → `characters/min.json`
- `text.scene.sample` → `text/scene.sample.json`
- `tilemap.sample` → `tilemaps/level1.json`
- `spritesheet.sample` → `sprites/spritesheet.png`

로더
- `../lib/game/reference/referenceData.js`
- `urlForReference(key)`, `loadReferenceJSON(key)`, `listReferenceKeys()`

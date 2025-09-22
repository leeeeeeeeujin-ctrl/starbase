// lib/modelClient.js
export function makeCallModel({ getKey }) {
return async function callModel({ system, userText }) {
const apiKey = getKey()
if (!apiKey) throw new Error('API 키가 필요합니다')


// 실제 모델 호출 자리에 Edge Function/직접 호출을 배치
// 여기서는 임시 스텁 응답
const aiText = `AI 응답(스텁): ${userText.slice(0, 60)}...\n결과: (캐릭터명) 승/패/탈락 중 하나를 마지막 줄에만 기입`
return { aiText }
}
}
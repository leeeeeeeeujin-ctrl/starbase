// lib/modelClient.js
export function makeCallModel({ getApiKey, systemPrompt }) {
  return async ({ user }) => {
    const key = getApiKey()
    if(!key) return { ok:false, error:'API 키가 없습니다.' }

    try{
      const rsp = await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{
          'Authorization': `Bearer ${key}`,
          'Content-Type':'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            ...(systemPrompt ? [{ role:'system', content: systemPrompt }] : []),
            { role:'user', content: user }
          ],
          temperature: 0.7,
        })
      })
      if(!rsp.ok){
        const t = await rsp.text()
        return { ok:false, error:`API 오류(${rsp.status}) ${t}` }
      }
      const json = await rsp.json()
      const text = json.choices?.[0]?.message?.content ?? ''
      const usage = json.usage ?? {}
      return { ok:true, text, tokenUsed:(usage.total_tokens||0), finishReason: json.choices?.[0]?.finish_reason }
    }catch(e){
      return { ok:false, error: e.message || '네트워크 오류' }
    }
  }
}

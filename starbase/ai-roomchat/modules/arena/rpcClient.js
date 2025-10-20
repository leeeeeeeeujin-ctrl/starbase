import { supabase } from '@/lib/supabase'

const DEFAULT_TIMEOUT_MS = 8000

export async function callRpc(name, params = {}, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  let timeoutId
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`rpc_timeout:${name}`)
        error.rpc = { name, params }
        reject(error)
      }, timeout)
    })

    const result = await Promise.race([supabase.rpc(name, params), timeoutPromise])
    if (result?.error) {
      result.error.context = { name, params }
      throw result.error
    }
    return result?.data ?? result
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function ensureRpc(name, params = {}, options) {
  try {
    return await callRpc(name, params, options)
  } catch (error) {
    console.error(`[rpcClient] ${name} failed`, error)
    throw error
  }
}

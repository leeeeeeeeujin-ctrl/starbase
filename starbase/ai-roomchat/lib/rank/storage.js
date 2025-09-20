import { supabase } from '../supabase'

export async function uploadGameImage(file) {
  if (!file) return { url: '' }
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `games/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('game_images').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('game_images').getPublicUrl(path)
  return { url: data.publicUrl }
}

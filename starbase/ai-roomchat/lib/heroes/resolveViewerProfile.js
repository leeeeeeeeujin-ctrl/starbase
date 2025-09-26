import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

export async function resolveViewerProfile(user, explicitHeroId) {
  if (!user) {
    return {
      name: '익명',
      avatar_url: null,
      hero_id: null,
      owner_id: null,
      user_id: null,
    }
  }

  if (explicitHeroId) {
    const { data: hero } = await withTable(supabase, 'heroes', (table) =>
      supabase
        .from(table)
        .select('id,name,image_url,owner_id')
        .eq('id', explicitHeroId)
        .single(),
    )

    if (hero) {
      return {
        name: hero.name,
        avatar_url: hero.image_url || null,
        hero_id: hero.id,
        owner_id: hero.owner_id || user.id,
        user_id: user.id,
      }
    }
  }

  const { data: myHero } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id,name,image_url,owner_id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  )

  if (myHero) {
    return {
      name: myHero.name,
      avatar_url: myHero.image_url || null,
      hero_id: myHero.id,
      owner_id: myHero.owner_id || user.id,
      user_id: user.id,
    }
  }

  const meta = user?.user_metadata || {}
  return {
    name: meta.full_name || meta.name || (user.email?.split('@')[0] ?? '익명'),
    avatar_url: meta.avatar_url || null,
    hero_id: null,
    owner_id: user.id,
    user_id: user.id,
  }
}

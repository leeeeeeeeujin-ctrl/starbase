// lib/rank/heroes.js
import { supabase } from './db';
import { buildRoleRequirements } from './roles';

export async function loadHeroesMap(heroIds) {
  const uniq = Array.from(new Set(heroIds.filter(Boolean)));
  if (!uniq.length) return {};
  const { data, error } = await supabase.from('heroes').select('*').in('id', uniq);
  if (error) throw error;
  const map = {};
  for (const h of data || []) map[h.id] = h;
  return map;
}

/** 슬롯 인덱스 0..N-1에 hero detail을 배치해 프롬프트 토큰용 구조로 만든다 */
export function buildSlotsMap({ roles = [], myHeroIds = [], oppPicks = [], heroesMap = {} }) {
  const slots = {};
  const requirements = buildRoleRequirements(roles);
  let slotNumber = 0;

  requirements.forEach((requirement, index) => {
    const heroId = myHeroIds[index] || null;
    const hero = (heroId && heroesMap[heroId]) || {};
    slots[slotNumber] = toPromptHero(hero, {
      sideLabel: 'ally',
      slotNumber,
      requirement,
      ownerId: hero?.owner_id ?? null,
    });
    slotNumber += 1;
  });

  const opponentStart = slotNumber;
  oppPicks.forEach((pick, index) => {
    const hero = (pick?.hero_id && heroesMap[pick.hero_id]) || {};
    const requirement = typeof pick?.slotIndex === 'number' ? pick : requirements[index] || null;
    const slotNo = opponentStart + index;
    slots[slotNo] = toPromptHero(hero, {
      sideLabel: 'opponent',
      slotNumber: slotNo,
      requirement,
      ownerId: pick?.from_owner ?? hero?.owner_id ?? null,
      status: pick?.status || 'active',
    });
  });

  return slots;
}

function toPromptHero(
  hero = {},
  {
    sideLabel = 'hero',
    slotNumber = null,
    requirement = null,
    ownerId = null,
    status = 'active',
  } = {}
) {
  const out = {
    name: hero.name || buildFallbackName({ hero, requirement, sideLabel }),
    description: hero.description || '',
  };

  for (let a = 1; a <= 12; a += 1) {
    out[`ability${a}`] = hero[`ability${a}`] || '';
  }

  out.hero_id = hero.id || null;
  out.owner_id = hero.owner_id ?? ownerId ?? null;
  out.ownerId = out.owner_id;
  out.owner = out.owner_id;
  out.side = sideLabel;
  out.side_label = sideLabel;
  out.sideLabel = sideLabel;
  out.status = hero.status || status || 'active';
  out.status_label = out.status;
  out.role = resolveRoleName({ hero, requirement });
  out.role_id = hero.role_id ?? requirement?.roleId ?? null;
  out.roleId = out.role_id;
  out.role_label = out.role;
  out.roleName = out.role;
  out.role_index = requirement?.roleIndex ?? null;
  out.role_slot_index = requirement?.roleSlotIndex ?? null;
  out.roleSlotIndex = out.role_slot_index;
  const roleSlotNumber =
    typeof requirement?.roleSlotIndex === 'number' ? requirement.roleSlotIndex + 1 : null;
  out.role_slot_number = roleSlotNumber;
  out.roleSlotNumber = roleSlotNumber;
  out.requirement_slot_index = requirement?.slotIndex ?? null;
  out.requirementSlotIndex = out.requirement_slot_index;
  out.slot_no = slotNumber;
  out.slotNo = slotNumber;
  out.slot_index = typeof slotNumber === 'number' ? slotNumber : null;
  out.slotIndex = out.slot_index;
  out.slot_number = typeof slotNumber === 'number' ? slotNumber + 1 : null;
  out.slotNumber = out.slot_number;
  out.background_url = hero.background_url || hero.backgroundUrl || null;
  out.backgroundUrl = out.background_url;
  out.bgm_url = hero.bgm_url || hero.bgmUrl || null;
  out.bgmUrl = out.bgm_url;
  out.audio_profile = hero.audio_profile || hero.audioProfile || null;
  out.audioProfile = out.audio_profile;
  out.name_or_role = out.name || out.role || '';
  out.display_name = out.name_or_role;

  return out;
}

function buildFallbackName({ hero, requirement, sideLabel }) {
  if (hero?.name) return hero.name;
  if (requirement?.roleName) {
    return `${sideLabel}-${requirement.roleName}`;
  }
  return `${sideLabel}-hero`;
}

function resolveRoleName({ hero, requirement }) {
  if (typeof hero?.role === 'string' && hero.role.trim()) {
    return hero.role.trim();
  }
  if (typeof requirement?.roleName === 'string') {
    return requirement.roleName;
  }
  return '';
}

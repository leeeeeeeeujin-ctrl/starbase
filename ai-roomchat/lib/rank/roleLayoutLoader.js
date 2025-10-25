import { withTable } from '../supabaseTables';

function normalizeRoleName(value) {
  if (!value) return '';
  if (typeof value !== 'string') return '';
  return value.trim();
}

function coerceSlotIndex(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function deriveGameRoleSlots(rawSlots = []) {
  if (!Array.isArray(rawSlots)) return [];

  const layout = [];

  rawSlots.forEach((value, index) => {
    if (value == null) return;

    let name = '';
    if (typeof value === 'string') {
      name = normalizeRoleName(value);
    } else if (typeof value === 'object') {
      name = normalizeRoleName(value.name ?? value.role ?? value.label ?? '');
    }

    if (!name) return;

    layout.push({
      slotIndex: index,
      role: name,
      heroId: null,
      heroOwnerId: null,
    });
  });

  return layout;
}

function coerceSlotCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function attachSlotCountPayload(name, count) {
  const slotCount = coerceSlotCount(count);
  return { name, slot_count: slotCount, slotCount };
}

function buildRolesFromLayout(layout = []) {
  const roleOrder = [];
  const roleCounts = new Map();

  layout.forEach(slot => {
    if (!slot) return;
    const name = normalizeRoleName(slot.role);
    if (!name) return;
    if (!roleCounts.has(name)) {
      roleCounts.set(name, 1);
      roleOrder.push(name);
    } else {
      roleCounts.set(name, roleCounts.get(name) + 1);
    }
  });

  return roleOrder.map(name => attachSlotCountPayload(name, roleCounts.get(name) || 0));
}

function buildLayoutFromSlotRows(slotRows = []) {
  const layout = [];

  slotRows.forEach(row => {
    if (!row) return;
    if (row.active === false) return;
    const roleName = normalizeRoleName(row.role);
    if (!roleName) return;
    const slotIndex = coerceSlotIndex(row.slot_index ?? row.slotIndex ?? row.slot_no ?? row.slotNo);
    if (slotIndex == null) return;

    layout.push({
      slotIndex,
      role: roleName,
      heroId: row.hero_id || row.heroId || null,
      heroOwnerId: row.hero_owner_id || row.heroOwnerId || null,
    });
  });

  layout.sort((a, b) => a.slotIndex - b.slotIndex);
  return layout;
}

function buildRolesFromRoleRows(roleRows = []) {
  const normalizedRoles = [];
  const roleMap = new Map();

  roleRows
    .filter(row => row && row.active !== false)
    .forEach(row => {
      const name = normalizeRoleName(row.name);
      if (!name) return;
      const requestedCount = Number(row.slot_count ?? row.slotCount ?? row.capacity);
      const normalizedCount =
        Number.isFinite(requestedCount) && requestedCount > 0 ? Math.trunc(requestedCount) : 0;
      if (normalizedCount <= 0) return;

      if (!roleMap.has(name)) {
        const entry = attachSlotCountPayload(name, normalizedCount);
        roleMap.set(name, entry);
        normalizedRoles.push(entry);
      } else {
        const entry = roleMap.get(name);
        const total = coerceSlotCount(entry.slot_count + normalizedCount);
        entry.slot_count = total;
        entry.slotCount = total;
      }
    });

  return normalizedRoles;
}

function buildLayoutFromRoleCounts(roleEntries = []) {
  const layout = [];
  let cursor = 0;

  roleEntries.forEach(entry => {
    if (!entry) return;
    const name = normalizeRoleName(entry.name);
    if (!name) return;
    const count = coerceSlotCount(entry.slot_count ?? entry.slotCount ?? 0);
    if (count <= 0) return;

    for (let index = 0; index < count; index += 1) {
      layout.push({ slotIndex: cursor, role: name, heroId: null, heroOwnerId: null });
      cursor += 1;
    }
  });

  return layout;
}

function mergeSlotAssignments(baseLayout = [], slotRows = []) {
  if (!Array.isArray(baseLayout) || baseLayout.length === 0) {
    return buildLayoutFromSlotRows(slotRows);
  }

  const cloned = baseLayout.map((slot, index) => ({
    slotIndex: coerceSlotIndex(slot.slotIndex ?? slot.slot_index ?? index),
    role: normalizeRoleName(slot.role),
    heroId: slot.heroId ?? slot.hero_id ?? null,
    heroOwnerId: slot.heroOwnerId ?? slot.hero_owner_id ?? null,
  }));

  if (!Array.isArray(slotRows) || slotRows.length === 0) {
    return cloned
      .map((slot, index) => ({
        slotIndex: Number.isFinite(slot.slotIndex) ? slot.slotIndex : index,
        role: slot.role,
        heroId: slot.heroId ?? null,
        heroOwnerId: slot.heroOwnerId ?? null,
      }))
      .sort((a, b) => a.slotIndex - b.slotIndex);
  }

  const sanitizedRows = buildLayoutFromSlotRows(slotRows);
  if (sanitizedRows.length === 0) {
    return cloned
      .map((slot, index) => ({
        slotIndex: Number.isFinite(slot.slotIndex) ? slot.slotIndex : index,
        role: slot.role,
        heroId: slot.heroId ?? null,
        heroOwnerId: slot.heroOwnerId ?? null,
      }))
      .sort((a, b) => a.slotIndex - b.slotIndex);
  }

  const appliedIndices = new Set();

  sanitizedRows.forEach(rowSlot => {
    const roleName = normalizeRoleName(rowSlot.role);
    if (!roleName) return;

    const attemptIndices = [];
    if (Number.isInteger(rowSlot.slotIndex)) {
      attemptIndices.push(rowSlot.slotIndex);
      if (rowSlot.slotIndex - 1 >= 0) {
        attemptIndices.push(rowSlot.slotIndex - 1);
      }
    }

    let targetIndex = null;
    for (const candidateIndex of attemptIndices) {
      if (!Number.isInteger(candidateIndex)) continue;
      if (candidateIndex < 0 || candidateIndex >= cloned.length) continue;
      if (appliedIndices.has(candidateIndex)) continue;
      const candidate = cloned[candidateIndex];
      if (normalizeRoleName(candidate.role) === roleName) {
        targetIndex = candidateIndex;
        break;
      }
    }

    if (targetIndex === null) {
      targetIndex = cloned.findIndex((slot, index) => {
        if (appliedIndices.has(index)) return false;
        return normalizeRoleName(slot.role) === roleName;
      });
      if (targetIndex === -1) {
        targetIndex = null;
      }
    }

    if (targetIndex === null) {
      return;
    }

    const existing = cloned[targetIndex];
    cloned[targetIndex] = {
      slotIndex: Number.isFinite(existing.slotIndex) ? existing.slotIndex : targetIndex,
      role: existing.role || roleName,
      heroId: rowSlot.heroId ?? existing.heroId ?? null,
      heroOwnerId: rowSlot.heroOwnerId ?? existing.heroOwnerId ?? null,
    };
    appliedIndices.add(targetIndex);
  });

  return cloned
    .map((slot, index) => ({
      slotIndex: Number.isFinite(slot.slotIndex) ? slot.slotIndex : index,
      role: slot.role,
      heroId: slot.heroId ?? null,
      heroOwnerId: slot.heroOwnerId ?? null,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex);
}

function normaliseRolesAndSlots(roleRows = [], slotRows = [], gameRoleSlots = []) {
  const inlineLayout = deriveGameRoleSlots(gameRoleSlots);
  if (inlineLayout.length > 0) {
    const mergedInlineLayout = mergeSlotAssignments(inlineLayout, slotRows);
    return {
      roles: buildRolesFromLayout(mergedInlineLayout),
      slotLayout: mergedInlineLayout,
    };
  }

  const rolesFromRows = buildRolesFromRoleRows(roleRows);

  const slotLayout = buildLayoutFromSlotRows(slotRows);
  if (slotLayout.length > 0) {
    if (rolesFromRows.length > 0) {
      const roleNames = new Set(
        rolesFromRows
          .map(role => normalizeRoleName(role.name))
          .filter(name => typeof name === 'string' && name.length > 0)
      );
      const layoutNames = new Set(
        slotLayout
          .map(slot => normalizeRoleName(slot.role))
          .filter(name => typeof name === 'string' && name.length > 0)
      );

      const layoutIncludesAllDeclaredRoles =
        roleNames.size === 0 || Array.from(roleNames).every(name => layoutNames.has(name));
      const layoutOnlyUsesDeclaredRoles =
        layoutNames.size === 0 || Array.from(layoutNames).every(name => roleNames.has(name));

      const shouldFallbackToRoles =
        roleNames.size > 0 &&
        (layoutNames.size === 0 ||
          (layoutNames.size < roleNames.size &&
            (!layoutIncludesAllDeclaredRoles || !layoutOnlyUsesDeclaredRoles)));

      if (!shouldFallbackToRoles) {
        return {
          roles: buildRolesFromLayout(slotLayout),
          slotLayout,
        };
      }
    } else {
      return {
        roles: buildRolesFromLayout(slotLayout),
        slotLayout,
      };
    }
  }

  if (rolesFromRows.length > 0) {
    return {
      roles: rolesFromRows,
      slotLayout: buildLayoutFromRoleCounts(rolesFromRows),
    };
  }

  return { roles: [], slotLayout: [] };
}

export async function loadRoleResources(supabaseClient, gameId) {
  if (!gameId) {
    return { roles: [], slotLayout: [] };
  }

  const [roleResult, slotResult, gameResult] = await Promise.all([
    withTable(supabaseClient, 'rank_game_roles', table =>
      supabaseClient.from(table).select('name, slot_count, active').eq('game_id', gameId)
    ),
    withTable(supabaseClient, 'rank_game_slots', table =>
      supabaseClient
        .from(table)
        .select('slot_index, role, active, hero_id, hero_owner_id')
        .eq('game_id', gameId)
    ),
    withTable(supabaseClient, 'rank_games', table =>
      supabaseClient.from(table).select('roles').eq('id', gameId).maybeSingle()
    ),
  ]);

  if (roleResult?.error) throw roleResult.error;
  if (slotResult?.error) throw slotResult.error;
  if (gameResult?.error) throw gameResult.error;

  const roleRows = Array.isArray(roleResult?.data) ? roleResult.data : [];
  const slotRows = Array.isArray(slotResult?.data) ? slotResult.data : [];

  let gameRoles = [];
  const rawGameRoles = gameResult?.data?.roles;
  if (Array.isArray(rawGameRoles)) {
    gameRoles = rawGameRoles;
  } else if (typeof rawGameRoles === 'string' && rawGameRoles.trim()) {
    try {
      const parsed = JSON.parse(rawGameRoles);
      if (Array.isArray(parsed)) {
        gameRoles = parsed;
      }
    } catch (error) {
      console.warn('rank_games.roles 파싱 실패:', error);
      gameRoles = [];
    }
  }

  return normaliseRolesAndSlots(roleRows, slotRows, gameRoles);
}

export async function loadActiveRoles(supabaseClient, gameId) {
  const { roles } = await loadRoleResources(supabaseClient, gameId);
  return roles;
}

export async function loadRoleLayout(supabaseClient, gameId) {
  const result = await loadRoleResources(supabaseClient, gameId);
  if (!Array.isArray(result.slotLayout)) {
    return { roles: Array.isArray(result.roles) ? result.roles : [], slotLayout: [] };
  }

  const sanitizedLayout = result.slotLayout
    .map((slot, index) => {
      if (!slot) return null;
      const roleName = normalizeRoleName(slot?.role);
      if (!roleName) return null;
      const rawIndex = Number(slot?.slotIndex ?? slot?.slot_index ?? index);
      if (!Number.isFinite(rawIndex) || rawIndex < 0) return null;
      return {
        slotIndex: rawIndex,
        role: roleName,
        heroId: slot?.heroId ?? slot?.hero_id ?? null,
        heroOwnerId: slot?.heroOwnerId ?? slot?.hero_owner_id ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  return {
    roles: Array.isArray(result.roles) ? result.roles : [],
    slotLayout: sanitizedLayout,
  };
}

export function buildRoleCapacityMap({ roles = [], slotLayout = [] } = {}) {
  const capacity = new Map();

  if (Array.isArray(slotLayout) && slotLayout.length > 0) {
    slotLayout.forEach(slot => {
      if (!slot) return;
      const roleName = normalizeRoleName(slot.role);
      if (!roleName) return;
      capacity.set(roleName, (capacity.get(roleName) || 0) + 1);
    });
    return capacity;
  }

  if (Array.isArray(roles)) {
    roles.forEach(role => {
      if (!role) return;
      const roleName = normalizeRoleName(role.name ?? role.role);
      if (!roleName) return;
      const rawCount = role.slot_count ?? role.slotCount ?? role.capacity;
      const slotCount = coerceSlotCount(rawCount, 0);
      if (slotCount <= 0) return;
      capacity.set(roleName, slotCount);
    });
  }

  return capacity;
}

export { normalizeRoleName, coerceSlotIndex, coerceSlotCount, normaliseRolesAndSlots };

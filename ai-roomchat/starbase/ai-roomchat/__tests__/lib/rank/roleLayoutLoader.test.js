import { loadActiveRoles, loadRoleLayout } from '@/lib/rank/roleLayoutLoader';

function createSupabaseStub(tableData = {}) {
  return {
    __tables: tableData,
    from(tableName) {
      const rows = tableData[tableName] || [];
      return createQueryBuilder(rows);
    },
  };
}

function createQueryBuilder(rows) {
  const filters = [];

  function runQuery() {
    return rows.filter(row => filters.every(filter => filter(row)));
  }

  return {
    select() {
      return this;
    },
    eq(column, value) {
      filters.push(row => {
        const candidate = row?.[column];
        if (candidate == null && value == null) return true;
        return String(candidate) === String(value);
      });
      return this;
    },
    maybeSingle() {
      const data = runQuery()[0] ?? null;
      return Promise.resolve({ data, error: null });
    },
    then(resolve, reject) {
      try {
        const data = runQuery();
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      } catch (error) {
        return Promise.resolve({ data: null, error }).then(resolve, reject);
      }
    },
  };
}

describe('roleLayoutLoader', () => {
  it('loads active roles and slots from Supabase tables', async () => {
    const supabase = createSupabaseStub({
      rank_game_roles: [
        { game_id: 'game-1', name: '공격', slot_count: 2, active: true },
        { game_id: 'game-1', name: '수비', slot_count: 1, active: true },
        { game_id: 'game-1', name: '비활성', slot_count: 4, active: false },
      ],
      rank_game_slots: [
        {
          game_id: 'game-1',
          slot_index: 0,
          role: '공격',
          active: true,
          hero_id: 'hero-a',
          hero_owner_id: 'owner-a',
        },
        { game_id: 'game-1', slot_index: 1, role: '공격', active: true },
        { game_id: 'game-1', slot_index: 2, role: '수비', active: true },
        { game_id: 'game-1', slot_index: 3, role: '공격', active: false },
      ],
    });

    const { roles, slotLayout } = await loadRoleLayout(supabase, 'game-1');

    expect(roles).toEqual([
      expect.objectContaining({ name: '공격', slot_count: 2, slotCount: 2 }),
      expect.objectContaining({ name: '수비', slot_count: 1, slotCount: 1 }),
    ]);
    expect(slotLayout).toHaveLength(3);
    expect(slotLayout[0]).toMatchObject({
      slotIndex: 0,
      role: '공격',
      heroId: 'hero-a',
      heroOwnerId: 'owner-a',
    });
    expect(slotLayout[1]).toMatchObject({ slotIndex: 1, role: '공격' });
    expect(slotLayout[2]).toMatchObject({ slotIndex: 2, role: '수비' });
  });

  it('falls back to inline rank_games roles when tables have no data', async () => {
    const supabase = createSupabaseStub({
      rank_game_roles: [],
      rank_game_slots: [],
      rank_games: [
        {
          id: 'game-inline',
          roles: JSON.stringify(['공격', '수비', '수비']),
        },
      ],
    });

    const { roles, slotLayout } = await loadRoleLayout(supabase, 'game-inline');

    expect(roles).toEqual([
      expect.objectContaining({ name: '공격', slot_count: 1, slotCount: 1 }),
      expect.objectContaining({ name: '수비', slot_count: 2, slotCount: 2 }),
    ]);
    expect(slotLayout).toHaveLength(3);
    expect(slotLayout.map(slot => slot.role)).toEqual(['공격', '수비', '수비']);
  });

  it('exposes active role counts when loading active roles', async () => {
    const supabase = createSupabaseStub({
      rank_game_roles: [
        { game_id: 'game-active', name: '지원', slot_count: 1, active: true },
        { game_id: 'game-active', name: '지원', slot_count: 2, active: true },
        { game_id: 'game-active', name: '수비', slot_count: 1, active: false },
      ],
      rank_game_slots: [],
    });

    const roles = await loadActiveRoles(supabase, 'game-active');

    expect(roles).toEqual([expect.objectContaining({ name: '지원', slot_count: 3, slotCount: 3 })]);
  });
});

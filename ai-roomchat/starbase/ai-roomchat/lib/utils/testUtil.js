// 테스트 유틸리티: mock, 샘플 데이터, 자동 검증
export function mockSession(
  ownerId = 'user-1',
  heroId = 'hero-1',
  role = 'attacker',
  slotIndex = 0
) {
  return {
    ownerId,
    heroId,
    role,
    slotIndex,
    ready: true,
    updatedAt: Date.now(),
  };
}

export function generateSampleRoster(count = 3) {
  return Array.from({ length: count }, (_, idx) =>
    mockSession(`user-${idx + 1}`, `hero-${idx + 1}`, idx % 2 === 0 ? 'attacker' : 'defender', idx)
  );
}

export function autoValidateRoster(roster) {
  const roles = roster.map(r => r.role);
  const slotIndices = roster.map(r => r.slotIndex);
  const ownerIds = roster.map(r => r.ownerId);
  const heroIds = roster.map(r => r.heroId);
  // 중복 체크
  const roleSet = new Set(roles);
  const slotSet = new Set(slotIndices);
  const ownerSet = new Set(ownerIds);
  const heroSet = new Set(heroIds);
  return {
    roleCount: roles.length,
    uniqueRoles: roleSet.size,
    slotCount: slotIndices.length,
    uniqueSlots: slotSet.size,
    ownerCount: ownerIds.length,
    uniqueOwners: ownerSet.size,
    heroCount: heroIds.length,
    uniqueHeroes: heroSet.size,
    hasDuplicates:
      roles.length !== roleSet.size ||
      slotIndices.length !== slotSet.size ||
      ownerIds.length !== ownerSet.size ||
      heroIds.length !== heroSet.size,
  };
}

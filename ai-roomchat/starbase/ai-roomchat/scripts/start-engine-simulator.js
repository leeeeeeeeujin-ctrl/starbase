#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function usage() {
  console.log(
    `Start Engine Simulator\n\nUsage:\n  node scripts/start-engine-simulator.js [fixture.json]\n\nOptions:\n  --fixture <path>   Load a specific JSON bundle (defaults to scripts/fixtures/start-engine-sample.json)\n  --output <path>    Write the sanitized participant list to a JSON file\n`
  );
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message || error);
    process.exit(1);
  }
}

function normalizeRole(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  return trimmed || '';
}

function parseSlotIndex(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  if (numeric < 0) return null;
  return numeric;
}

function buildSlots(participants = []) {
  const slots = [];
  const overflow = [];
  participants.forEach(participant => {
    if (!participant) return;
    const hero = participant.hero || {};
    const slotIndex = parseSlotIndex(participant.slot_no ?? participant.slotNo);
    const entry = {
      id: participant.hero_id ?? participant.heroId ?? hero.id ?? null,
      slot_no: slotIndex,
      name: hero.name || null,
      role: participant.role || null,
    };
    if (slotIndex != null && slots[slotIndex] === undefined) {
      slots[slotIndex] = entry;
    } else {
      overflow.push(entry);
    }
  });
  if (overflow.length) {
    return slots.concat(overflow);
  }
  return slots;
}

function collectExpectations(slotLayout = [], matchingMetadata = {}) {
  const slotRoleMap = new Map();
  const heroRoleMap = new Map();
  const ownerRoleMap = new Map();

  if (Array.isArray(slotLayout)) {
    slotLayout.forEach(slot => {
      const slotIndex = parseSlotIndex(slot.slot_index ?? slot.slotIndex ?? slot.slot_no);
      const role = normalizeRole(slot.role);
      if (slotIndex != null && role) {
        slotRoleMap.set(slotIndex, role);
      }
    });
  }

  const assignments = Array.isArray(matchingMetadata.assignments)
    ? matchingMetadata.assignments
    : [];
  assignments.forEach(assignment => {
    const roleSlots = Array.isArray(assignment.roleSlots)
      ? assignment.roleSlots
      : Array.isArray(assignment.role_slots)
        ? assignment.role_slots
        : [];
    const members = Array.isArray(assignment.members) ? assignment.members : [];

    roleSlots.forEach(slotValue => {
      if (!slotValue) return;
      const slotRole = normalizeRole(slotValue.role ?? assignment.role);
      if (!slotRole) return;
      const slotIndex = parseSlotIndex(
        slotValue.localIndex ?? slotValue.slotIndex ?? slotValue.slot_index ?? slotValue
      );
      if (slotIndex != null && !slotRoleMap.has(slotIndex)) {
        slotRoleMap.set(slotIndex, slotRole);
      }
    });

    members.forEach(member => {
      const memberRole = normalizeRole(member.role ?? assignment.role);
      const slotIndex = parseSlotIndex(
        member.slot_no ?? member.slotNo ?? member.slot_index ?? member.slotIndex
      );
      if (slotIndex != null && memberRole && !slotRoleMap.has(slotIndex)) {
        slotRoleMap.set(slotIndex, memberRole);
      }
      const heroId = member.hero_id ?? member.heroId ?? member.heroID ?? member.hero?.id;
      if (heroId && memberRole && !heroRoleMap.has(String(heroId).trim())) {
        heroRoleMap.set(String(heroId).trim(), memberRole);
      }
      const ownerId = member.owner_id ?? member.ownerId ?? member.ownerID ?? member.owner?.id;
      if (ownerId && memberRole && !ownerRoleMap.has(String(ownerId).trim())) {
        ownerRoleMap.set(String(ownerId).trim(), memberRole);
      }
    });
  });

  if (matchingMetadata.heroMap && typeof matchingMetadata.heroMap === 'object') {
    const entries =
      matchingMetadata.heroMap instanceof Map
        ? matchingMetadata.heroMap.entries()
        : Object.entries(matchingMetadata.heroMap);
    for (const [heroKey, value] of entries) {
      const role = normalizeRole(value?.role ?? value?.assignmentRole);
      if (role && !heroRoleMap.has(String(heroKey).trim())) {
        heroRoleMap.set(String(heroKey).trim(), role);
      }
      const slotIndex = parseSlotIndex(
        value?.slot_no ?? value?.slotNo ?? value?.slot_index ?? value?.slotIndex
      );
      if (slotIndex != null && role && !slotRoleMap.has(slotIndex)) {
        slotRoleMap.set(slotIndex, role);
      }
      const ownerId = value?.owner_id ?? value?.ownerId;
      if (ownerId && role && !ownerRoleMap.has(String(ownerId).trim())) {
        ownerRoleMap.set(String(ownerId).trim(), role);
      }
    }
  }

  return { slotRoleMap, heroRoleMap, ownerRoleMap };
}

function reconcileParticipants(participants = [], slotLayout = [], matchingMetadata = {}) {
  const expectations = collectExpectations(slotLayout, matchingMetadata);
  const sanitized = [];
  const removed = [];

  participants.forEach(participant => {
    if (!participant) return;
    const slotIndex = parseSlotIndex(
      participant.slot_no ?? participant.slotNo ?? participant.slot_index ?? participant.slotIndex
    );
    const heroId = participant.hero_id ?? participant.hero?.id ?? null;
    const ownerId = participant.owner_id ?? participant.ownerId ?? participant.owner?.id ?? null;
    const actualRole = normalizeRole(participant.role);

    const sources = [];
    if (slotIndex != null) {
      const expected = expectations.slotRoleMap.get(slotIndex);
      if (expected) {
        sources.push({ type: 'slot', slotIndex, role: expected });
      }
    }
    if (heroId != null) {
      const expected = expectations.heroRoleMap.get(String(heroId).trim());
      if (expected) {
        sources.push({ type: 'hero', heroId: String(heroId).trim(), role: expected });
      }
    }
    if (ownerId != null) {
      const expected = expectations.ownerRoleMap.get(String(ownerId).trim());
      if (expected) {
        sources.push({ type: 'owner', ownerId: String(ownerId).trim(), role: expected });
      }
    }

    const expectedEntry = sources.find(entry => entry.role);
    if (expectedEntry && actualRole && expectedEntry.role !== actualRole) {
      removed.push({
        participant,
        expectedRole: expectedEntry.role,
        actualRole,
        slotIndex,
      });
      return;
    }

    sanitized.push(participant);
  });

  return { sanitized, removed };
}

function describeRemoved(removed = []) {
  if (!removed.length) return '  (none)';
  return removed
    .map(entry => {
      const heroName = entry.participant?.hero?.name || entry.participant?.hero_id || 'unknown';
      const slot = entry.slotIndex != null ? `slot ${entry.slotIndex}` : 'slot ?';
      return `  - ${slot} ${heroName}: expected ${entry.expectedRole}, actual ${entry.actualRole}`;
    })
    .join('\n');
}

function listDuplicates(participants = []) {
  const seen = new Map();
  const duplicates = [];
  participants.forEach(participant => {
    const heroId = participant.hero_id ?? participant.hero?.id;
    if (!heroId) return;
    const key = String(heroId).trim();
    if (!key) return;
    const slot = parseSlotIndex(participant.slot_no ?? participant.slot_index);
    if (!seen.has(key)) {
      seen.set(key, { count: 1, slots: slot != null ? [slot] : [] });
    } else {
      const entry = seen.get(key);
      entry.count += 1;
      if (slot != null) entry.slots.push(slot);
      seen.set(key, entry);
    }
  });
  for (const [heroId, entry] of seen.entries()) {
    if (entry.count > 1) {
      duplicates.push({ heroId, slots: entry.slots });
    }
  }
  return duplicates;
}

function main() {
  const args = process.argv.slice(2);
  let fixturePath = null;
  let outputPath = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--fixture') {
      fixturePath = args[index + 1];
      index += 1;
    } else if (arg === '--output') {
      outputPath = args[index + 1];
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      return;
    } else if (!arg.startsWith('--') && !fixturePath) {
      fixturePath = arg;
    }
  }

  const defaultFixture = path.join(__dirname, 'fixtures', 'start-engine-sample.json');
  const resolvedPath = fixturePath ? path.resolve(process.cwd(), fixturePath) : defaultFixture;

  const payload = readJson(resolvedPath);
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const slotLayout = Array.isArray(payload.slotLayout) ? payload.slotLayout : [];
  const matchingMetadata = payload.matchMeta || payload.matchingMetadata || {};

  console.log(`Loaded fixture: ${resolvedPath}`);
  console.log(`Participants: ${participants.length}`);
  console.log(`Slot layout entries: ${slotLayout.length}`);
  console.log(
    `Assignments: ${Array.isArray(matchingMetadata.assignments) ? matchingMetadata.assignments.length : 0}`
  );

  const { sanitized, removed } = reconcileParticipants(participants, slotLayout, matchingMetadata);

  console.log('\nRole reconciliation summary:');
  console.log(`  Kept participants: ${sanitized.length}`);
  console.log(`  Removed participants: ${removed.length}`);
  console.log(describeRemoved(removed));

  const duplicates = listDuplicates(sanitized);
  if (duplicates.length) {
    console.log('\nDuplicate hero assignments detected:');
    duplicates.forEach(entry => {
      const slotInfo = entry.slots.length ? ` slots ${entry.slots.join(', ')}` : '';
      console.log(`  - ${entry.heroId}${slotInfo}`);
    });
  } else {
    console.log('\nNo duplicate hero assignments detected.');
  }

  const slots = buildSlots(sanitized);
  if (slots.length) {
    console.log('\nSlot lineup:');
    slots.forEach((slot, index) => {
      if (!slot) {
        console.log(`  [${index}] <empty>`);
        return;
      }
      console.log(
        `  [${index}] ${slot.name || slot.id || 'unknown'} (role: ${slot.role || 'n/a'})`
      );
    });
  }

  if (outputPath) {
    const resolvedOutput = path.resolve(process.cwd(), outputPath);
    const outputPayload = { ...payload, participants: sanitized };
    fs.writeFileSync(resolvedOutput, JSON.stringify(outputPayload, null, 2));
    console.log(`\nSanitized bundle saved to ${resolvedOutput}`);
  }
}

main();

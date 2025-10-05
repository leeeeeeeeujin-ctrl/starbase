export function normalizeHeroName(name) {
  if (!name) return ''
  return String(name).normalize('NFC').replace(/\s+/g, '').toLowerCase()
}

import { findParticipantBySlotIndex } from './participants'

export function resolveActorContext({ node, slots, participants }) {
  if (!node) {
    return { slotIndex: -1, heroSlot: null, participant: null }
  }

  const visibleSlots = Array.isArray(node?.options?.visible_slots)
    ? node.options.visible_slots
    : []

  const normalizedVisible = visibleSlots
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => value - 1)

  let slotIndex = -1
  const rawSlotNo = Number(node?.slot_no)
  if (Number.isFinite(rawSlotNo) && rawSlotNo > 0) {
    slotIndex = rawSlotNo - 1
  }
  if (slotIndex < 0 && normalizedVisible.length > 0) {
    slotIndex = normalizedVisible[0]
  }
  if (slotIndex < 0 && slots.length > 0) {
    slotIndex = 0
  }

  const heroSlot = slotIndex >= 0 && slotIndex < slots.length ? slots[slotIndex] : null
  const participant = findParticipantBySlotIndex(participants, slotIndex)

  return { slotIndex, heroSlot, participant }
}

export function buildUserActionPersona({ heroSlot, participant }) {
  const name = heroSlot?.name || participant?.hero?.name || '플레이어 캐릭터'
  const role = participant?.role || heroSlot?.role || ''
  const description = heroSlot?.description || participant?.hero?.description || ''

  const abilities = []
  for (let index = 1; index <= 4; index += 1) {
    const ability = heroSlot?.[`ability${index}`] || participant?.hero?.[`ability${index}`]
    if (ability) abilities.push(ability)
  }

  const header = role ? `${name} (${role})` : name

  const systemLines = [
    `${header}의 1인칭 시점으로 대사와 행동을 작성하세요.`,
    description ? `캐릭터 설명: ${description}` : null,
    abilities.length ? `주요 능력: ${abilities.join(', ')}` : null,
    '상황을 충분히 묘사하고 캐릭터의 말투를 유지하세요.',
  ].filter(Boolean)

  const promptIntro = `상황을 참고해 ${header}가 어떤 행동을 취할지 서술하세요.`

  return {
    system: systemLines.join('\n'),
    prompt: promptIntro,
  }
}

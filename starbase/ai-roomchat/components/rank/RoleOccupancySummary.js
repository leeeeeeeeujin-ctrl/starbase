'use client'

import styles from './RoleOccupancySummary.module.css'

function resolveNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric < 0) return 0
  return numeric
}

export default function RoleOccupancySummary({ occupancy, title = '역할별 점유 현황' }) {
  if (!Array.isArray(occupancy) || occupancy.length === 0) {
    return null
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.title}>{title}</h3>
      <ul className={styles.list}>
        {occupancy.map((entry) => {
          if (!entry) return null
          const name = entry.name || '역할'
          const totalSlots = resolveNumber(entry.totalSlots)
          const minimum = totalSlots ?? resolveNumber(entry.capacity)
          const participantCount = resolveNumber(entry.participantCount) ?? 0
          const baselineReady =
            resolveNumber(entry.occupiedSlots) ??
            (minimum != null ? Math.min(participantCount, minimum) : participantCount)
          const shortfall = minimum != null ? Math.max(minimum - baselineReady, 0) : null
          const overflow = minimum != null ? Math.max(participantCount - baselineReady, 0) : 0

          const countLabel = `${participantCount}명 참여 중`
          const detailParts = []
          if (minimum != null) {
            detailParts.push(`기본 슬롯 ${baselineReady}/${minimum}`)
            detailParts.push(shortfall && shortfall > 0 ? `시작까지 ${shortfall}명 필요` : '기본 슬롯 충족')
          } else {
            detailParts.push('기본 슬롯 제한 없음')
          }
          if (overflow > 0) {
            detailParts.push(`추가 참가자 ${overflow}명`)
          }
          const availabilityLabel = detailParts.join(' · ')

          return (
            <li
              key={name}
              className={`${styles.item} ${shortfall === 0 && minimum != null ? styles.itemReady : ''}`.trim()}
            >
              <div className={styles.meta}>
                <span className={styles.name}>{name}</span>
                <span className={styles.count}>{countLabel}</span>
              </div>
              <span className={styles.availability}>{availabilityLabel}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

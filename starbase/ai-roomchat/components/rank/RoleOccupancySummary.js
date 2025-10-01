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
          const capacity =
            totalSlots ?? resolveNumber(entry.capacity)
          const occupied =
            resolveNumber(entry.occupiedSlots) ?? resolveNumber(entry.participantCount) ?? 0
          const available =
            resolveNumber(entry.availableSlots) ?? (capacity != null ? Math.max(capacity - occupied, 0) : null)
          const full = capacity != null && occupied >= capacity

          const countLabel = capacity != null ? `${occupied}/${capacity}명` : `${occupied}명 참여 중`
          let availabilityLabel = '참여 가능'
          if (capacity == null) {
            availabilityLabel = '가용 슬롯 제한 없음'
          } else if (available === 0) {
            availabilityLabel = '정원 마감'
          } else if (available != null) {
            availabilityLabel = `${available}명 남음`
          }

          return (
            <li
              key={name}
              className={`${styles.item} ${full ? styles.itemFull : ''}`.trim()}
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

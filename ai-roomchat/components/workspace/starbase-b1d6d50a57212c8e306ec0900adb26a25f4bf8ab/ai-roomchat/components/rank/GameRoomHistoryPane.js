import TimelineSection from './Timeline/TimelineSection';
import styles from './GameRoomView.module.css';
import { describeDropInSummary, formatDate } from '@/lib/rank/gameRoomHistory';

/**
 * @param {Object} props
 * @param {import('@/lib/rank/timelineEvents').TimelineEvent[]} props.spectatorTimeline
 * @param {boolean} props.spectatorTimelineCollapsed
 * @param {() => void} props.onToggleSpectatorTimeline
 * @param {import('@/lib/rank/timelineEvents').TimelineEvent[]} props.personalTimeline
 * @param {boolean} props.personalTimelineCollapsed
 * @param {() => void} props.onTogglePersonalTimeline
 * @param {Array} props.personalReplays
 * @param {Array} props.sharedReplays
 * @param {(entry: any) => void} props.onDownloadReplay
 */
export default function GameRoomHistoryPane({
  spectatorTimeline,
  spectatorTimelineCollapsed,
  onToggleSpectatorTimeline,
  personalTimeline,
  personalTimelineCollapsed,
  onTogglePersonalTimeline,
  personalReplays,
  sharedReplays,
  onDownloadReplay,
}) {
  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>관전 타임라인</h2>
          {spectatorTimeline.length ? (
            <span className={styles.sectionBadge}>{spectatorTimeline.length}</span>
          ) : null}
        </div>
        <div className={styles.timelineContainer}>
          <TimelineSection
            title="실시간 이벤트"
            events={spectatorTimeline}
            collapsed={spectatorTimelineCollapsed}
            onToggle={onToggleSpectatorTimeline}
            emptyMessage="아직 관전 타임라인 이벤트가 없습니다."
            collapsedNotice="타임라인을 접었습니다. 펼쳐서 경고·난입, API 키 교체 이벤트를 확인하세요."
          />
        </div>
      </section>

      {personalTimeline.length ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>내 세션 타임라인</h2>
            <span className={styles.sectionBadge}>{personalTimeline.length}</span>
          </div>
          <div className={styles.timelineContainer}>
            <TimelineSection
              title="최근 자동 진행 이벤트"
              events={personalTimeline}
              collapsed={personalTimelineCollapsed}
              onToggle={onTogglePersonalTimeline}
              emptyMessage="아직 기록된 타임라인 이벤트가 없습니다."
              collapsedNotice="타임라인을 접었습니다. 펼쳐서 내 세션의 경고·난입 이벤트를 확인하세요."
            />
          </div>
        </section>
      ) : null}

      {personalReplays.length ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>내 세션 베틀로그</h2>
            <span className={styles.sectionBadge}>{personalReplays.length}</span>
          </div>
          <ul className={styles.replayList}>
            {personalReplays.map(entry => (
              <li key={entry.id} className={styles.replayItem}>
                <div>
                  <div className={styles.replayHeaderRow}>
                    <span className={styles.replayLabel}>{entry.label}</span>
                    <span className={styles.replayResult}>
                      {(entry.result || 'unknown').toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.replayMetaRow}>
                    {entry.generatedAt ? (
                      <span className={styles.replayMeta}>
                        생성 {formatDate(entry.generatedAt)}
                      </span>
                    ) : null}
                    {Number.isFinite(entry.turnCount) ? (
                      <span className={styles.replayMeta}>턴 {entry.turnCount}</span>
                    ) : null}
                    {Number.isFinite(entry.timelineCount) ? (
                      <span className={styles.replayMeta}>타임라인 {entry.timelineCount}</span>
                    ) : null}
                    {entry.dropIn ? (
                      <span className={styles.replayMeta}>
                        {describeDropInSummary(entry.dropIn)}
                      </span>
                    ) : null}
                    {entry.reason ? (
                      <span className={styles.replayMetaReason}>{entry.reason}</span>
                    ) : null}
                  </div>
                </div>
                <div className={styles.replayActions}>
                  <button
                    type="button"
                    className={styles.replayButton}
                    onClick={() => onDownloadReplay(entry)}
                  >
                    JSON 저장
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sharedReplays.length ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>공유 세션 베틀로그</h2>
            <span className={styles.sectionBadge}>{sharedReplays.length}</span>
          </div>
          <ul className={styles.replayList}>
            {sharedReplays.map(entry => (
              <li key={entry.id} className={styles.replayItem}>
                <div>
                  <div className={styles.replayHeaderRow}>
                    <span className={styles.replayLabel}>{entry.label}</span>
                    <span className={styles.replayResult}>
                      {(entry.result || 'unknown').toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.replayMetaRow}>
                    {entry.generatedAt ? (
                      <span className={styles.replayMeta}>
                        생성 {formatDate(entry.generatedAt)}
                      </span>
                    ) : null}
                    {Number.isFinite(entry.turnCount) ? (
                      <span className={styles.replayMeta}>턴 {entry.turnCount}</span>
                    ) : null}
                    {Number.isFinite(entry.timelineCount) ? (
                      <span className={styles.replayMeta}>타임라인 {entry.timelineCount}</span>
                    ) : null}
                    {entry.dropIn ? (
                      <span className={styles.replayMeta}>
                        {describeDropInSummary(entry.dropIn)}
                      </span>
                    ) : null}
                    {entry.reason ? (
                      <span className={styles.replayMetaReason}>{entry.reason}</span>
                    ) : null}
                  </div>
                </div>
                <div className={styles.replayActions}>
                  <button
                    type="button"
                    className={styles.replayButton}
                    onClick={() => onDownloadReplay(entry)}
                  >
                    JSON 저장
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

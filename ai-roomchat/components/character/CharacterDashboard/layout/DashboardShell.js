import BackgroundLayer from '../sections/BackgroundLayer';
import { shellStyles, navigationStyles, quickActionStyles } from './styles';

export default function DashboardShell({
  backgroundUrl,
  heroName,
  heroSubtitle,
  heroMeta = [],
  sections = [],
  activeSectionId,
  onSelectSection,
  quickActions = [],
  children,
  footer,
}) {
  return (
    <div style={shellStyles.root}>
      <BackgroundLayer backgroundUrl={backgroundUrl} />
      <div style={shellStyles.inner}>
        <div style={shellStyles.surface}>
          <aside style={shellStyles.sidebar}>
            <HeroSummary heroName={heroName} heroSubtitle={heroSubtitle} heroMeta={heroMeta} />
            <SectionNavigation
              sections={sections}
              activeSectionId={activeSectionId}
              onSelectSection={onSelectSection}
            />
            <QuickActionList actions={quickActions} />
          </aside>
          <section style={shellStyles.panel}>
            <div style={shellStyles.panelBody}>{children}</div>
          </section>
        </div>
        {footer ? <div style={shellStyles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

function HeroSummary({ heroName, heroSubtitle, heroMeta }) {
  if (!heroName) return null;
  return (
    <div style={shellStyles.heroCard}>
      <span style={shellStyles.heroLabel}>선택한 영웅</span>
      <h1 style={shellStyles.heroName}>{heroName}</h1>
      {heroSubtitle ? <p style={shellStyles.heroSubtitle}>{heroSubtitle}</p> : null}
      {heroMeta?.length ? (
        <dl style={shellStyles.heroMetaList}>
          {heroMeta.map(meta => {
            if (!meta || (!meta.label && !meta.value)) return null;
            const key = meta.id || meta.label;
            return (
              <div key={key} style={shellStyles.heroMetaRow}>
                <dt style={shellStyles.heroMetaLabel}>{meta.label}</dt>
                <dd style={shellStyles.heroMetaValue}>{meta.value}</dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </div>
  );
}

function SectionNavigation({ sections, activeSectionId, onSelectSection }) {
  if (!sections?.length) return null;
  return (
    <nav style={navigationStyles.root}>
      <span style={navigationStyles.label}>대시보드 섹션</span>
      <div style={navigationStyles.list}>
        {sections.map(section => {
          const active = section.id === activeSectionId;
          const style = {
            ...navigationStyles.buttonBase,
            ...(active ? navigationStyles.buttonActive : navigationStyles.buttonInactive),
          };
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectSection?.(section.id)}
              style={style}
            >
              <span>{section.label}</span>
              {section.description ? (
                <span style={navigationStyles.buttonDescription}>{section.description}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function QuickActionList({ actions }) {
  if (!actions?.length) return null;
  return (
    <div style={quickActionStyles.root}>
      <span style={quickActionStyles.label}>빠른 작업</span>
      <div style={quickActionStyles.list}>
        {actions.map(action => {
          if (!action) return null;
          const key = action.id || action.label;
          const isDisabled = Boolean(action.disabled);
          const style = {
            ...quickActionStyles.buttonBase,
            ...(action.tone === 'primary'
              ? quickActionStyles.buttonPrimary
              : quickActionStyles.buttonMuted),
            ...(isDisabled
              ? {
                  opacity: 0.55,
                  cursor: 'not-allowed',
                  boxShadow: 'none',
                }
              : null),
          };
          return (
            <button
              key={key}
              type="button"
              onClick={isDisabled ? undefined : action.onSelect}
              style={style}
              disabled={isDisabled}
            >
              <span>{action.label}</span>
              {action.description ? (
                <span style={quickActionStyles.buttonDescription}>{action.description}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

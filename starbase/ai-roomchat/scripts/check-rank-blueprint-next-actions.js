#!/usr/bin/env node
/**
 * Inspect data/rankBlueprintNextActions.json and alert when next actions
 * are overdue or within the imminent window so maintainers can follow up
 * without manually opening the overview doc.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const snapshotPath = path.join(rootDir, 'data', 'rankBlueprintNextActions.json');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function readSnapshot() {
  try {
    const contents = fs.readFileSync(snapshotPath, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    console.error(`Unable to read or parse ${snapshotPath}:`, error.message);
    throw error;
  }
}

function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseISODateOnly(value) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match.map(Number);
  if ([year, month, day].some((part) => Number.isNaN(part))) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function formatBadge(diffDays) {
  if (diffDays < 0) {
    return `D+${Math.abs(diffDays)}`;
  }
  if (diffDays === 0) {
    return 'D-DAY';
  }
  return `D-${diffDays}`;
}

function main() {
  const snapshot = readSnapshot();
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];

  if (!items.length) {
    console.warn('No next actions found in rankBlueprintNextActions.json.');
    return;
  }

  const today = startOfUTCDay(new Date());
  const overdue = [];
  const imminent = [];

  items.forEach((item) => {
    const daysFromToday =
      typeof item?.timing?.daysFromToday === 'number'
        ? item.timing.daysFromToday
        : (() => {
            const target = parseISODateOnly(item?.targetDateISO);
            if (!target) {
              return null;
            }
            return Math.floor((target.getTime() - today.getTime()) / MS_PER_DAY);
          })();

    if (typeof daysFromToday !== 'number') {
      return;
    }

    if (daysFromToday < 0) {
      overdue.push({ item, daysFromToday });
    } else if (daysFromToday <= 3) {
      imminent.push({ item, daysFromToday });
    }
  });

  if (overdue.length) {
    console.error('Detected overdue next actions:');
    overdue.forEach(({ item, daysFromToday }) => {
      const owner = item.owner || '담당 미지정';
      const dateLabel = item.timing?.label || item.targetDateDisplay || item.targetDateISO || '목표일 미정';
      const badge = item.timing?.badge || formatBadge(daysFromToday);
      console.error(` - ${owner} · ${dateLabel} (${badge}) — ${item.summary}`);
    });
    process.exitCode = 1;
  } else {
    console.log('No overdue next actions detected.');
  }

  if (imminent.length) {
    console.warn('Upcoming deadlines within 3 days:');
    imminent.forEach(({ item, daysFromToday }) => {
      const owner = item.owner || '담당 미지정';
      const dateLabel = item.timing?.label || item.targetDateDisplay || item.targetDateISO || '목표일 미정';
      const badge = item.timing?.badge || formatBadge(daysFromToday);
      console.warn(` - ${owner} · ${dateLabel} (${badge}) — ${item.summary}`);
    });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

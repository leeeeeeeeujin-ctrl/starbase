#!/usr/bin/env node
/**
 * Synchronise the landing blueprint progress JSON with the markdown snapshot
 * published in docs/rank-blueprint-overview.md.
 */

const fs = require('fs');
const path = require('path');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const rootDir = path.resolve(__dirname, '..');
const overviewPath = path.join(rootDir, 'docs', 'rank-blueprint-overview.md');
const progressOutputPath = path.join(rootDir, 'data', 'rankBlueprintProgress.json');
const nextActionsOutputPath = path.join(rootDir, 'data', 'rankBlueprintNextActions.json');

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

function formatDateISO(date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function normaliseOwnerKey(owner) {
  if (!owner) {
    return null;
  }

  const normalised = owner
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return normalised || null;
}

function readOverview() {
  try {
    return fs.readFileSync(overviewPath, 'utf8');
  } catch (error) {
    console.error(`Failed to read overview markdown at ${overviewPath}`);
    throw error;
  }
}

function extractProgressSection(markdown) {
  const sectionRegex = /##\s*7\.\s*진행률 현황\s*\((\d{4}-\d{2}-\d{2})\)([\s\S]*?)(?:\n\n\*\*총 진행률|\n\*\*총 진행률)/;
  const match = markdown.match(sectionRegex);
  if (!match) {
    throw new Error('Unable to locate the 진행률 현황 section in the overview markdown.');
  }
  const [, isoDate, sectionContent] = match;
  return { isoDate, sectionContent };
}

function extractNextActionsSection(markdown) {
  const sectionRegex = /##\s*6\.\s*다음 액션 스냅샷([\s\S]*?)(?:\n##\s*7\.|$)/;
  const match = markdown.match(sectionRegex);
  if (!match) {
    throw new Error('Unable to locate the 다음 액션 스냅샷 section in the overview markdown.');
  }

  return match[1];
}

function parseProgressTable(sectionContent) {
  const lines = sectionContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  if (lines.length <= 2) {
    throw new Error('The 진행률 현황 table appears to be missing rows.');
  }

  const dataLines = lines.filter((line) => !line.startsWith('| ---'));
  // Remove the header row.
  dataLines.shift();

  return dataLines.map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 4) {
      throw new Error(`Unexpected table row format: ${line}`);
    }

    const [label, status, progressCell, summary] = cells;
    const progressMatch = progressCell.match(/(\d+(?:\.\d+)?)%?/);

    if (!progressMatch) {
      throw new Error(`Unable to parse progress percentage from cell: ${progressCell}`);
    }

    const progress = Math.round(parseFloat(progressMatch[1]));

    return {
      label,
      status,
      progress,
      summary: summary.replace(/\s+/g, ' ').trim(),
    };
  });
}

function parseNextActions(sectionContent) {
  const tableLines = sectionContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  if (tableLines.length > 0) {
    const dataLines = tableLines.filter((line) => !line.startsWith('| ---'));
    // Remove header row if present.
    if (dataLines.length && dataLines[0].match(/^\|\s*순번\s*\|/)) {
      dataLines.shift();
    }

    if (!dataLines.length) {
      throw new Error('다음 액션 테이블이 비어 있습니다.');
    }

    return dataLines.map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());

      if (cells.length < 4) {
        throw new Error(`예상치 못한 다음 액션 테이블 행 형식: ${line}`);
      }

      const [orderCell, summaryCell, ownerCell, targetCell] = cells;
      const order = Number(orderCell);
      if (!Number.isFinite(order)) {
        throw new Error(`순번을 숫자로 파싱할 수 없습니다: ${orderCell}`);
      }

      const summary = summaryCell.replace(/\s+/g, ' ').trim();
      const owner = ownerCell.replace(/\s+/g, ' ').trim();
      const target = targetCell.replace(/\s+/g, ' ').trim();
      const targetMatch = target.match(/(\d{4}-\d{2}-\d{2})/);

      return {
        order,
        summary,
        owner,
        targetDateISO: targetMatch ? targetMatch[1] : null,
        targetDateDisplay: target,
      };
    });
  }

  // Fallback to list parsing for backward compatibility with earlier formats.
  const lines = sectionContent
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const actions = [];
  let current = null;

  lines.forEach((line) => {
    const match = line.match(/^(\d+)\.\s+(.*)$/);
    if (match) {
      if (current) {
        actions.push(current);
      }
      current = {
        order: Number(match[1]),
        summary: match[2].trim(),
      };
      return;
    }

    if (current) {
      current.summary = `${current.summary} ${line}`.trim();
    }
  });

  if (current) {
    actions.push(current);
  }

  if (!actions.length) {
    throw new Error('Failed to parse any next actions from the overview markdown.');
  }

  return actions
    .sort((a, b) => a.order - b.order)
    .map((action) => ({
      order: action.order,
      summary: action.summary.replace(/\s+/g, ' ').trim(),
      owner: null,
      targetDateISO: null,
      targetDateDisplay: null,
    }));
}

function deriveTimingForAction(action, snapshotISO) {
  const label = action.targetDateDisplay || action.targetDateISO || null;
  const targetDate = action.targetDateISO ? parseISODateOnly(action.targetDateISO) : null;
  const today = startOfUTCDay(new Date());
  const computedAtISO = formatDateISO(today);
  const snapshotDate = snapshotISO ? parseISODateOnly(snapshotISO) : null;

  if (!targetDate) {
    return {
      label,
      badge: null,
      state: 'unscheduled',
      daysFromToday: null,
      daysFromSnapshot: null,
      computedAtISO,
      isOverdue: false,
      overdueDays: 0,
    };
  }

  const daysFromToday = Math.floor((targetDate.getTime() - today.getTime()) / MS_PER_DAY);
  const daysFromSnapshot = snapshotDate
    ? Math.floor((targetDate.getTime() - snapshotDate.getTime()) / MS_PER_DAY)
    : null;

  let state = 'scheduled';
  if (daysFromToday < 0) {
    state = 'overdue';
  } else if (daysFromToday <= 3) {
    state = 'due-imminent';
  } else if (daysFromToday <= 7) {
    state = 'due-soon';
  }

  const badge = daysFromToday < 0
    ? `D+${Math.abs(daysFromToday)}`
    : daysFromToday === 0
    ? 'D-DAY'
    : `D-${daysFromToday}`;

  return {
    label,
    badge,
    state,
    daysFromToday,
    daysFromSnapshot,
    computedAtISO,
    isOverdue: state === 'overdue',
    overdueDays: state === 'overdue' ? Math.abs(daysFromToday) : 0,
  };
}

function decorateNextActions(actions, snapshotISO) {
  return actions.map((action) => {
    const timing = deriveTimingForAction(action, snapshotISO);

    return {
      ...action,
      ownerKey: normaliseOwnerKey(action.owner),
      timing,
    };
  });
}

function buildStatusBlock(actions) {
  if (!actions.length) {
    return '> ⚠️ 다음 액션 항목을 찾지 못했습니다. 개요 문서를 확인해 주세요.';
  }

  const computedAtISO = actions[0]?.timing?.computedAtISO || formatDateISO(startOfUTCDay(new Date()));
  const overdue = actions.filter((action) => action.timing?.isOverdue);
  const imminent = actions.filter(
    (action) => !action.timing?.isOverdue && action.timing?.state === 'due-imminent',
  );

  const lines = [`> _${computedAtISO} 기준 자동 생성된 기한 알림._`];

  if (overdue.length) {
    lines.push('> ⚠️ **기한 경과 항목**');
    overdue.forEach((action) => {
      const badge = action.timing?.badge ? ` (${action.timing.badge})` : '';
      const owner = action.owner || '담당 미지정';
      const dateLabel = action.timing?.label || action.targetDateDisplay || action.targetDateISO || '목표일 미정';
      lines.push(`> - ${owner} · ${dateLabel}${badge}: ${action.summary}`);
    });
  }

  if (imminent.length) {
    lines.push('> ⏰ **임박한 목표일 (3일 이하)**');
    imminent.forEach((action) => {
      const badge = action.timing?.badge ? ` (${action.timing.badge})` : '';
      const owner = action.owner || '담당 미지정';
      const dateLabel = action.timing?.label || action.targetDateDisplay || action.targetDateISO || '목표일 미정';
      lines.push(`> - ${owner} · ${dateLabel}${badge}: ${action.summary}`);
    });
  }

  if (!overdue.length && !imminent.length) {
    lines.push('> ✅ 모든 항목이 목표일 이내에 있습니다.');
  }

  return lines.join('\n');
}

function updateOverviewStatusNote(markdown, statusBlock) {
  const startMarker = '<!-- next-actions-status:start -->';
  const endMarker = '<!-- next-actions-status:end -->';
  const blockRegex = new RegExp(`${startMarker}[\s\S]*?${endMarker}`);
  const replacement = `${startMarker}\n${statusBlock}\n${endMarker}`;

  if (blockRegex.test(markdown)) {
    return markdown.replace(blockRegex, replacement);
  }

  const insertionPoint = markdown.indexOf('## 6. 다음 액션 스냅샷');
  if (insertionPoint === -1) {
    return markdown;
  }

  const before = markdown.slice(0, insertionPoint);
  const after = markdown.slice(insertionPoint);
  return `${before}${startMarker}\n${statusBlock}\n${endMarker}\n\n${after}`;
}

function buildProgressPayload({ isoDate, stages }) {
  return {
    lastUpdatedISO: isoDate,
    lastUpdatedDisplay: `${isoDate} 기준`,
    stages,
  };
}

function buildNextActionsPayload({ isoDate, actions }) {
  return {
    lastUpdatedISO: isoDate,
    lastUpdatedDisplay: `${isoDate} 기준`,
    items: actions.map((action) => ({
      order: action.order,
      summary: action.summary,
      owner: action.owner || null,
      ownerKey: action.ownerKey || null,
      targetDateISO: action.targetDateISO || null,
      targetDateDisplay: action.targetDateDisplay || null,
      timing: {
        label: action.timing?.label || (action.targetDateDisplay || action.targetDateISO || null),
        badge: action.timing?.badge || null,
        state: action.timing?.state || (action.targetDateISO ? 'scheduled' : 'unscheduled'),
        daysFromToday:
          typeof action.timing?.daysFromToday === 'number' ? action.timing.daysFromToday : null,
        daysFromSnapshot:
          typeof action.timing?.daysFromSnapshot === 'number'
            ? action.timing.daysFromSnapshot
            : null,
        computedAtISO: action.timing?.computedAtISO || null,
        isOverdue: Boolean(action.timing?.isOverdue),
        overdueDays:
          typeof action.timing?.overdueDays === 'number' ? action.timing.overdueDays : 0,
      },
    })),
  };
}

function writeJson(outputPath, payload) {
  const formatted = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(outputPath, formatted, 'utf8');
}

function main() {
  const markdown = readOverview();
  const { isoDate, sectionContent } = extractProgressSection(markdown);
  const stages = parseProgressTable(sectionContent);
  const actionsSection = extractNextActionsSection(markdown);
  const parsedActions = parseNextActions(actionsSection);
  const decoratedActions = decorateNextActions(parsedActions, isoDate);

  const statusBlock = buildStatusBlock(decoratedActions);
  const updatedMarkdown = updateOverviewStatusNote(markdown, statusBlock);

  const progressPayload = buildProgressPayload({ isoDate, stages });
  const nextActionsPayload = buildNextActionsPayload({ isoDate, actions: decoratedActions });

  writeJson(progressOutputPath, progressPayload);
  writeJson(nextActionsOutputPath, nextActionsPayload);

  if (updatedMarkdown !== markdown) {
    fs.writeFileSync(overviewPath, updatedMarkdown, 'utf8');
  }

  const overdueCount = decoratedActions.filter((action) => action.timing?.isOverdue).length;
  const imminentCount = decoratedActions.filter(
    (action) => !action.timing?.isOverdue && action.timing?.state === 'due-imminent',
  ).length;

  console.log(
    `Updated ${path.relative(rootDir, progressOutputPath)} (${stages.length} stages) and ${path.relative(
      rootDir,
      nextActionsOutputPath,
    )} (${decoratedActions.length} next actions) dated ${isoDate}. ` +
      `Alerts — overdue: ${overdueCount}, due soon: ${imminentCount}.`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

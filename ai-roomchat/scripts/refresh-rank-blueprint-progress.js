#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  return args.reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (key === '--date') {
      acc.date = value;
    }
    return acc;
  }, {});
}

function parseISODateOnly(value) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatISODate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(iso) {
  return `${iso} 기준`;
}

function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function computeDiffInDays(target, reference) {
  const diffMs = startOfUTCDay(target).getTime() - startOfUTCDay(reference).getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

async function readJson(filePath) {
  const buffer = await fs.readFile(filePath, 'utf8');
  return JSON.parse(buffer);
}

async function writeJson(filePath, data) {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, content, 'utf8');
}

function computeOverallProgress(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return 0;
  }
  const sum = stages.reduce((total, stage) => {
    const value = Number(stage?.progress);
    if (Number.isFinite(value)) {
      return total + value;
    }
    return total;
  }, 0);
  return Math.round(sum / stages.length);
}

function computeTiming(targetISO, snapshotDate) {
  if (!targetISO) {
    return {
      label: null,
      badge: null,
      state: 'unscheduled',
      daysFromToday: null,
      daysFromSnapshot: null,
      computedAtISO: formatISODate(snapshotDate),
      isOverdue: false,
      overdueDays: 0,
    };
  }

  const targetDate = parseISODateOnly(targetISO);
  if (!targetDate) {
    return {
      label: targetISO,
      badge: null,
      state: 'scheduled',
      daysFromToday: null,
      daysFromSnapshot: null,
      computedAtISO: formatISODate(snapshotDate),
      isOverdue: false,
      overdueDays: 0,
    };
  }

  const diffDays = computeDiffInDays(targetDate, snapshotDate);

  let badge;
  if (diffDays < 0) {
    badge = `D+${Math.abs(diffDays)}`;
  } else if (diffDays === 0) {
    badge = 'D-DAY';
  } else {
    badge = `D-${diffDays}`;
  }

  const state =
    diffDays < 0
      ? 'overdue'
      : diffDays <= 3
        ? 'due-imminent'
        : diffDays <= 7
          ? 'due-soon'
          : 'scheduled';

  return {
    label: targetISO,
    badge,
    state,
    daysFromToday: diffDays,
    daysFromSnapshot: diffDays,
    computedAtISO: formatISODate(snapshotDate),
    isOverdue: diffDays < 0,
    overdueDays: diffDays < 0 ? Math.abs(diffDays) : 0,
  };
}

function buildProgressSection(displayDate, stages, overall) {
  const lines = [];
  lines.push(`## 7. 진행률 현황 (${displayDate})`);
  lines.push('');
  lines.push('| 단계 | 상태 | 진행률 | 메모 |');
  lines.push('| --- | --- | --- | --- |');
  stages.forEach(stage => {
    const progress = Number(stage.progress);
    const progressLabel = Number.isFinite(progress) ? `${progress}%` : 'N/A';
    lines.push(`| ${stage.label} | ${stage.status} | ${progressLabel} | ${stage.summary} |`);
  });
  lines.push('');
  lines.push(`**총 진행률(단계별 동일 가중치)**: 약 **${overall}%**`);
  lines.push('');
  return lines.join('\n');
}

function buildRemainingSection(displayDate, remainingFocus, stageMap) {
  const lines = [];
  lines.push(`### 8. 남은 청사진 핵심 작업 (${displayDate})`);
  lines.push('| 단계 | 남은 핵심 작업 | 현재 진행률 |');
  lines.push('| --- | --- | --- |');
  remainingFocus.forEach(focus => {
    const stage = stageMap.get(focus.stage);
    const progress = stage ? `${Number(stage.progress)}%` : 'N/A';
    lines.push(`| ${focus.stage} | ${focus.nextStep} | ${progress} |`);
  });
  lines.push('');
  return lines.join('\n');
}

function buildNextActionsSection(displayDate, items) {
  const lines = [];
  lines.push('## 6. 다음 액션 스냅샷');
  lines.push('');

  const overdue = items.filter(item => item.timing?.state === 'overdue');
  const dueImminent = items.filter(item => item.timing?.state === 'due-imminent');
  const dueSoon = items.filter(item => item.timing?.state === 'due-soon');

  const formatLabels = list =>
    list.map(item => `#${item.order}${item.owner ? ` (${item.owner})` : ''}`).join(', ');

  let statusLine;
  if (overdue.length) {
    statusLine = `⚠️ ${formatLabels(overdue)} 마감이 지났습니다.`;
  } else if (dueImminent.length) {
    statusLine = `⏰ ${formatLabels(dueImminent)} 마감이 임박했습니다.`;
  } else if (dueSoon.length) {
    statusLine = `📅 ${formatLabels(dueSoon)} 마감이 일주일 이내입니다.`;
  } else {
    statusLine = '✅ 모든 항목이 목표일 이내에 있습니다.';
  }

  lines.push('<!-- next-actions-status:start -->');
  lines.push(`> _${displayDate} 자동 생성된 기한 알림._`);
  lines.push(`> ${statusLine}`);
  lines.push('<!-- next-actions-status:end -->');
  lines.push('');
  lines.push('| 순번 | 작업 | 담당 | 목표일 | 우선순위 | 예상 리소스 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  items
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach(item => {
      const target = item.targetDateDisplay || item.targetDateISO || '-';
      const priority = item.priority?.label || '-';
      const effort = item.effort?.label || '-';
      lines.push(
        `| ${item.order} | ${item.summary} | ${item.owner || '-'} | ${target} | ${priority} | ${effort} |`
      );
    });
  lines.push('');
  return lines.join('\n');
}

function replaceBetweenMarkers(content, startMarker, endMarker, replacement) {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`문서에서 "${startMarker}" 마커를 찾을 수 없습니다.`);
  }
  const endIndex = content.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) {
    throw new Error(`문서에서 "${endMarker}" 마커를 찾을 수 없습니다.`);
  }
  const before = content.slice(0, startIndex + startMarker.length);
  const after = content.slice(endIndex);
  return `${before}\n${replacement}${after}`;
}

async function updateDocumentation(progressData, nextActionsData) {
  const docPath = path.join(__dirname, '..', 'docs', 'rank-blueprint-overview.md');
  const docContent = await fs.readFile(docPath, 'utf8');

  const stageMap = new Map(progressData.stages.map(stage => [stage.label, stage]));

  const nextActionsSection = buildNextActionsSection(
    progressData.lastUpdatedDisplay,
    nextActionsData.items
  );
  const progressSection = buildProgressSection(
    progressData.lastUpdatedDisplay,
    progressData.stages,
    progressData.overallProgress
  );
  const remainingSection = buildRemainingSection(
    progressData.lastUpdatedDisplay,
    progressData.remainingFocus,
    stageMap
  );

  const withNextActions = replaceBetweenMarkers(
    docContent,
    '<!-- blueprint-next-actions:start -->',
    '<!-- blueprint-next-actions:end -->',
    `${nextActionsSection}\n`
  );

  const withProgress = replaceBetweenMarkers(
    withNextActions,
    '<!-- blueprint-progress:start -->',
    '<!-- blueprint-progress:end -->',
    `${progressSection}\n`
  );

  const finalContent = replaceBetweenMarkers(
    withProgress,
    '<!-- blueprint-remaining:start -->',
    '<!-- blueprint-remaining:end -->',
    `${remainingSection}\n`
  );

  await fs.writeFile(docPath, finalContent, 'utf8');
}

async function main() {
  const args = parseArgs();
  let snapshotDate;
  if (args.date) {
    const parsed = parseISODateOnly(args.date);
    if (!parsed) {
      throw new Error('유효한 --date=YYYY-MM-DD 값을 입력해 주세요.');
    }
    snapshotDate = parsed;
  } else {
    snapshotDate = startOfUTCDay(new Date());
  }

  const progressPath = path.join(__dirname, '..', 'data', 'rankBlueprintProgress.json');
  const nextActionsPath = path.join(__dirname, '..', 'data', 'rankBlueprintNextActions.json');

  const [progressData, nextActionsData] = await Promise.all([
    readJson(progressPath),
    readJson(nextActionsPath),
  ]);

  const overallProgress = computeOverallProgress(progressData.stages);

  const snapshotISO = formatISODate(snapshotDate);
  const displayDate = formatDisplayDate(snapshotISO);

  const normalisedStages = (Array.isArray(progressData.stages) ? progressData.stages : []).map(
    stage => ({
      ...stage,
      progress: Number(stage.progress),
    })
  );

  const normalisedRemaining = (
    Array.isArray(progressData.remainingFocus) ? progressData.remainingFocus : []
  ).map(focus => ({
    ...focus,
  }));

  const normalisedNextActions = (
    Array.isArray(nextActionsData.items) ? nextActionsData.items : []
  ).map(item => {
    const timing = computeTiming(item.targetDateISO, snapshotDate);
    return {
      ...item,
      timing: {
        ...item.timing,
        ...timing,
      },
    };
  });

  const updatedProgress = {
    ...progressData,
    lastUpdatedISO: snapshotISO,
    lastUpdatedDisplay: displayDate,
    overallProgress,
    stages: normalisedStages,
    remainingFocus: normalisedRemaining,
  };

  const updatedNextActions = {
    ...nextActionsData,
    lastUpdatedISO: snapshotISO,
    lastUpdatedDisplay: displayDate,
    items: normalisedNextActions,
  };

  await Promise.all([
    writeJson(progressPath, updatedProgress),
    writeJson(nextActionsPath, updatedNextActions),
  ]);

  await updateDocumentation(updatedProgress, updatedNextActions);

  console.log(`랭크 청사진 진행 데이터를 ${snapshotISO} 기준으로 새로 고쳤습니다.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

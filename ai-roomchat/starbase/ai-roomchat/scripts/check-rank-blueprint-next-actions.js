#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

function parseISODateOnly(value) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function diffInDays(target, reference) {
  const ms = startOfUTCDay(target).getTime() - startOfUTCDay(reference).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'rankBlueprintNextActions.json');
  const raw = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(raw);

  const items = Array.isArray(data.items) ? data.items : [];
  const today = startOfUTCDay(new Date());

  const overdue = [];
  const unscheduled = [];

  items.forEach(item => {
    const date = parseISODateOnly(item.targetDateISO);
    if (!date) {
      unscheduled.push(item);
      return;
    }
    const diff = diffInDays(date, today);
    if (diff < 0) {
      overdue.push({ item, overdueDays: Math.abs(diff) });
    }
  });

  if (unscheduled.length) {
    const ids = unscheduled.map(entry => `#${entry.order || '?'} (${entry.summary})`).join(', ');
    console.error(`❌ 다음 액션에 목표일이 빠졌습니다: ${ids}`);
    process.exitCode = 1;
    return;
  }

  if (overdue.length) {
    const desc = overdue
      .map(({ item, overdueDays }) => `#${item.order || '?'} (${item.summary}) - D+${overdueDays}`)
      .join(', ');
    console.error(`❌ 기한이 지난 다음 액션이 있습니다: ${desc}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ ${items.length}건의 다음 액션이 모두 기한 이내입니다.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

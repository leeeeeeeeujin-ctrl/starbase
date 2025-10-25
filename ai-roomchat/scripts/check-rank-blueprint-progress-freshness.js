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

function diffInDays(a, b) {
  const ms = startOfUTCDay(a).getTime() - startOfUTCDay(b).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'rankBlueprintProgress.json');
  const raw = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(raw);

  const lastUpdatedISO = data.lastUpdatedISO;
  const lastUpdatedDate = parseISODateOnly(lastUpdatedISO);
  if (!lastUpdatedDate) {
    console.error(
      '❌ rankBlueprintProgress.json: lastUpdatedISO 값이 유효한 날짜 형식이 아닙니다.'
    );
    process.exitCode = 1;
    return;
  }

  const today = startOfUTCDay(new Date());
  const rawAgeDays = diffInDays(today, lastUpdatedDate);
  const ageDays = Math.max(0, rawAgeDays);
  const limit = 14;

  if (ageDays > limit) {
    console.error(
      `❌ 청사진 진행 데이터가 ${ageDays}일 동안 갱신되지 않았습니다. (허용 최대 ${limit}일)`
    );
    process.exitCode = 1;
    return;
  }

  const freshnessLabel =
    rawAgeDays < 0 ? `미래 스냅샷 (${lastUpdatedISO})` : `${ageDays}일 전 (${lastUpdatedISO})`;

  console.log(`✅ 청사진 진행 데이터는 ${freshnessLabel}에 갱신되었습니다.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

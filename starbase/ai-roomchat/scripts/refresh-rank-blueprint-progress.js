#!/usr/bin/env node
/**
 * Synchronise the landing blueprint progress JSON with the markdown snapshot
 * published in docs/rank-blueprint-overview.md.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const overviewPath = path.join(rootDir, 'docs', 'rank-blueprint-overview.md');
const outputPath = path.join(rootDir, 'data', 'rankBlueprintProgress.json');

function readOverview() {
  try {
    return fs.readFileSync(overviewPath, 'utf8');
  } catch (error) {
    console.error(`Failed to read overview markdown at ${overviewPath}`);
    throw error;
  }
}

function extractSection(markdown) {
  const sectionRegex = /##\s*7\.\s*진행률 현황\s*\((\d{4}-\d{2}-\d{2})\)([\s\S]*?)(?:\n\n\*\*총 진행률|\n\*\*총 진행률)/;
  const match = markdown.match(sectionRegex);
  if (!match) {
    throw new Error('Unable to locate the 진행률 현황 section in the overview markdown.');
  }
  const [, isoDate, sectionContent] = match;
  return { isoDate, sectionContent };
}

function parseTable(sectionContent) {
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

function buildPayload({ isoDate, stages }) {
  return {
    lastUpdatedISO: isoDate,
    lastUpdatedDisplay: `${isoDate} 기준`,
    stages,
  };
}

function writeOutput(payload) {
  const formatted = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(outputPath, formatted, 'utf8');
}

function main() {
  const markdown = readOverview();
  const { isoDate, sectionContent } = extractSection(markdown);
  const stages = parseTable(sectionContent);
  const payload = buildPayload({ isoDate, stages });
  writeOutput(payload);
  console.log(`Updated ${path.relative(rootDir, outputPath)} with ${stages.length} stages dated ${isoDate}.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

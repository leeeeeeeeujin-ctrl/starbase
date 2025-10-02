#!/usr/bin/env node
/**
 * Synchronise the landing blueprint progress JSON with the markdown snapshot
 * published in docs/rank-blueprint-overview.md.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const overviewPath = path.join(rootDir, 'docs', 'rank-blueprint-overview.md');
const progressOutputPath = path.join(rootDir, 'data', 'rankBlueprintProgress.json');
const nextActionsOutputPath = path.join(rootDir, 'data', 'rankBlueprintNextActions.json');

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
    }));
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
    items: actions,
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
  const actions = parseNextActions(actionsSection);

  const progressPayload = buildProgressPayload({ isoDate, stages });
  const nextActionsPayload = buildNextActionsPayload({ isoDate, actions });

  writeJson(progressOutputPath, progressPayload);
  writeJson(nextActionsOutputPath, nextActionsPayload);

  console.log(
    `Updated ${path.relative(rootDir, progressOutputPath)} (${stages.length} stages) and ${path.relative(
      rootDir,
      nextActionsOutputPath,
    )} (${actions.length} next actions) dated ${isoDate}.`,
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

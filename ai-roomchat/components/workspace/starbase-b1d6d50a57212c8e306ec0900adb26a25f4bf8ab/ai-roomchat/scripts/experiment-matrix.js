#!/usr/bin/env node

(async function main() {
  try {
    const fs = require('fs');
    const path = require('path');
    const { pathToFileURL } = require('url');

    const base = path.join(__dirname, '..');
    const promptPath = path.join(base, 'lib', 'rank', 'prompt.js');
    const ledgerPath = path.join(
      base,
      'components',
      'rank',
      'StartClient',
      'engine',
      'outcomeLedger.js'
    );
    const promptMod = await import(pathToFileURL(promptPath).href);
    const ledgerMod = await import(pathToFileURL(ledgerPath).href);

    const { compileTemplate } = promptMod;
    const { createOutcomeLedger, recordOutcomeLedger, buildOutcomeSnapshot } = ledgerMod;

    // sample participants
    const participants = [
      {
        id: 'p1',
        slot_no: 0,
        role: 'attacker',
        hero: { id: 'h1', name: 'Alicia', role: 'attacker', side: 'red', ability1: 'Slash' },
        score: 100,
      },
      {
        id: 'p2',
        slot_no: 1,
        role: 'defender',
        hero: { id: 'h2', name: 'Borin', role: 'defender', side: 'blue', ability1: 'Guard' },
        score: 90,
      },
    ];

    const slotsMap = {};
    participants.forEach(p => {
      const s = Number.isFinite(Number(p.slot_no)) ? Number(p.slot_no) : null;
      if (s != null) slotsMap[s] = { ...p.hero, slotNo: s, slotIndex: s };
    });

    // templates to test
    const templates = [
      { id: 't1', template: '전투: {{slot0.name}} vs {{slot1.name}}\n결과: {{slot0.name}} 승리' },
      { id: 't2', template: '요약: {{history.last1}}\n활성 변수: {{slot0.ability1}}' },
      { id: 't3', template: '무작위: {{random.choice:공|무|무승부}} - {{slot1.role}}' },
    ];

    const variableSets = [
      { id: 'vars-none', activeNames: [] },
      { id: 'vars-a', activeNames: ['rage'] },
      { id: 'vars-b', activeNames: ['focus'] },
    ];

    const report = [];

    for (const tmpl of templates) {
      for (const vars of variableSets) {
        const compiled = compileTemplate({
          template: tmpl.template,
          slotsMap,
          historyText: '지난 턴: 아무것도 없음',
        });

        // simulate ledger update: assume the response declares first hero as winner
        const ledger = createOutcomeLedger({ participants, roleSettings: {} });
        const simulatedResultLine = `${participants[0].hero.name} 승리`;
        const rec = recordOutcomeLedger(ledger, {
          turn: 1,
          resultLine: simulatedResultLine,
          variables: vars.activeNames,
          actors: [participants[0].hero.name],
          participantsSnapshot: participants,
        });
        const snapshot = buildOutcomeSnapshot(ledger);

        report.push({
          templateId: tmpl.id,
          template: tmpl.template,
          varsId: vars.id,
          compiledPrompt: compiled.text.slice(0, 1000),
          meta: compiled.meta || {},
          ledgerChanged: rec.changed || false,
          snapshotOverallResult: snapshot.overallResult,
          snapshotEntries: snapshot.entries.map(e => ({
            key: e.key,
            heroName: e.heroName,
            channel: e.channel,
            result: e.result,
            projected: e.projectedScore,
          })),
        });
      }
    }

    const outDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'experiment-matrix.json');
    fs.writeFileSync(
      outPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2),
      'utf8'
    );
    console.log('Wrote experiment report to', outPath);
  } catch (err) {
    console.error('experiment-matrix failed:', err && err.message ? err.message : err);
    process.exitCode = 2;
  }
})();

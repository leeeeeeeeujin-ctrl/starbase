#!/usr/bin/env node

(async function main() {
  try {
    const path = require('path');
    const { pathToFileURL } = require('url');
    const scriptDir = __dirname;

    // Dynamic import of modules that do not rely on the '@/' alias.
    const promptPath = path.join(scriptDir, '..', 'lib', 'rank', 'prompt.js');
    const ledgerPath = path.join(
      scriptDir,
      '..',
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

    console.log('\n=== Experiment: prompt/template and ledger flow ===\n');

    // --- Build a simple participants / slots map ---
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

    // --- Prompt templates to test ---
    const templates = [
      {
        name: 'zero-based simple',
        template: '전투 결과: {{slot0.name}}(역할: {{slot0.role}}) vs {{slot1.name}}',
      },
      {
        name: 'one-based placeholders',
        template: '결과: {{slot1.name}} 대 {{slot2.name}}\n승자는: {{slot1.name}}',
      },
      {
        name: 'random & history',
        template:
          '최근: {{history.last1}}\n무작위 슬롯: {{slot.random}}\n선택: {{random.choice:승|패|무}}\n능력: {{slot0.ability1}}',
      },
      {
        name: 'fallback and missing slot',
        template: '미지정 슬롯: {{slot5.name}} vs {{slot0.name}}',
      },
    ];

    // Run compileTemplate for each template and show compile meta
    for (const t of templates) {
      const { text, meta } = compileTemplate({
        template: t.template,
        slotsMap,
        historyText: '지난 턴: 아무것도 없음',
      });
      console.log(`-- template: ${t.name}`);
      console.log('compiled text:\n', text.slice(0, 500));
      console.log('meta.slots keys:', Object.keys(meta.slots || {}));
      console.log('\n');
    }

    // --- Create an outcome ledger from participants and simulate turns ---
    const ledger = createOutcomeLedger({ participants, roleSettings: {} });
    console.log(
      'Initial ledger entries:',
      ledger.entries.map(e => ({ key: e.key, heroName: e.heroName }))
    );

    // Simulate 3 turns with result lines that should update the ledger
    const turns = [
      { turn: 1, resultLine: 'Alicia 승리', variables: ['rage'], actors: ['Alicia'] },
      { turn: 2, resultLine: 'Borin 패배', variables: ['defend'], actors: ['Borin'] },
      { turn: 3, resultLine: 'Alicia 승리', variables: [], actors: ['Alicia'] },
    ];

    for (const t of turns) {
      const res = recordOutcomeLedger(ledger, {
        turn: t.turn,
        resultLine: t.resultLine,
        variables: t.variables,
        actors: t.actors,
        participantsSnapshot: participants,
      });
      console.log(
        `Turn ${t.turn} applied changed=${res.changed} completed=${res.completed || false}`
      );
    }

    const snapshot = buildOutcomeSnapshot(ledger);
    console.log('\nFinal snapshot.overallResult:', snapshot.overallResult);
    console.log('Snapshot entries with channels:');
    snapshot.entries.forEach(e =>
      console.log(
        `  - ${e.heroName} key=${e.key} channel=${e.channel} result=${e.result} projected=${e.projectedScore}`
      )
    );

    // Demonstrate sortEntriesByOutcome (import from ledger module if present)
    if (typeof ledgerMod.sortEntriesByOutcome === 'function') {
      const sorted = ledgerMod.sortEntriesByOutcome(snapshot.entries);
      console.log(
        '\nSorted entries (by outcome):',
        sorted.map(e => ({ hero: e.heroName, result: e.result }))
      );
    }

    console.log('\n=== Experiment complete ===\n');
  } catch (err) {
    console.error('Experiment failed:', err && err.message ? err.message : err);
    process.exitCode = 2;
  }
})();

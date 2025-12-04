# Workspace Score Scripts

- Place custom score/settle scripts here.
- Input: battleLog (normalized), participants, meta.
- Output: { scores:{[slotId]:{total?,delta?,reason?}}, winners:[], losers:[], draw?:boolean, highlightIds?:[] }.
- Example file: score-default.js
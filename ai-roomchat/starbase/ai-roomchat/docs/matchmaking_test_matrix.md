# Matchmaking Test Matrix

This doc outlines critical variables and scenarios to cover for rank matching.

## Variables

- Roles & slot counts
  - Single-slot roles (e.g., 공격 x1)
  - Multi-slot roles (e.g., 수비 x2, 정찰 x3)
  - Mixed roles (1 offense + 2 defense)
- Queue composition
  - Solos, parties (duo/trio) within a role
  - Mixed scores (close vs far apart)
  - Joined order
  - Unsupported roles in queue
- Constraints
  - Score windows (DEFAULT_SCORE_WINDOWS)
  - Global hero uniqueness
  - Owner uniqueness
  - Role capacity enforcement

## Core Invariants

- No overfill: assigned per-role count <= slotCount
- No duplicate heroes or owners in a room
- Ready only when all slots are filled
- Score window respected when rooms are assembled

## How to run

- Unit tests:
  - npm test -- matching.rank.test.js
  - npm test -- roleLayoutLoader.test.js
- Fuzzer (optional):
  - node scripts/matching-fuzzer.js 500

The fuzzer prints a summary JSON with pass/fail counts based on invariants.

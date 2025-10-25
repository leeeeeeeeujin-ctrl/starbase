# Prompt Engine Module

The prompt engine converts Supabase prompt-set records into the prompts consumed by
rank battles. The functions re-exported from `index.js` expect a common schema that
callers must satisfy when passing slot and bridge data.

## Slot shape

Each slot object should include the following properties:

- `id` – unique identifier. Optional when compiling transient graphs, but required when
  evaluating bridge conditions.
- `slot_no` – zero-based order that determines player prompts and bridge remapping.
- `slot_type` – either `ai`, `manual`, or `system` to determine how turns are driven.
- `slot_pick` – string identifier for selection rules (defaults to `'1'`).
- `template` – raw template string before variable interpolation.
- `var_rules_global` / `var_rules_local` – arrays of rule groups that match the output
  of `sanitizeVariableRules`.
- `visible_slots` – array of numeric slot IDs that are visible to this slot.
- `invisible` – whether the slot should be hidden from the roster.
- `is_start` – true if the slot starts the scenario.

Optional coordinates `canvas_x` / `canvas_y` are passed through to React Flow helpers
and ignored by the compiler.

## Bridge shape

Bridge records connect two slots and optionally apply conditions before activating:

- `from_slot_id` / `to_slot_id` – identifiers that match the slot IDs supplied above.
- `trigger_words` – array of keywords used by manual outcomes.
- `conditions` – array of condition descriptors consumed by `bridges.evaluateConditions`.
- `priority` – numeric priority (higher executes first).
- `probability` – probability weight between 0 and 1.
- `fallback` – marks the bridge as a fallback path when conditions fail.
- `action` – action enum (e.g., `continue`, `end`).

## Key exports

- `compileTemplate(slot, context)` – renders a slot template with the supplied
  variable context.
- `buildSystemPrompt(bundle)` – builds the final system prompt for the battle.
- `populateSlots(bundle)` – normalizes Supabase rows into in-memory slot objects.
- `createStatusIndex(history)` – produces quick lookup tables for slot status counts.
- `evaluateBridgeOutcome(bridge, context)` – resolves bridge actions when advancing turns.

Consumers should treat the helpers as pure functions: they do not perform Supabase
queries and expect sanitized data as described above.

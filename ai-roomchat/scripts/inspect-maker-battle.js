#!/usr/bin/env node
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');
const { parseTurnTemplate } = require('../lib/battle/turnTemplate');

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or service role key.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function resolveSetId(input) {
  if (!input) return null;

  const direct = await supabase
    .from('prompt_sets')
    .select('id, name, description, owner_id, created_at')
    .eq('id', input)
    .maybeSingle();

  if (direct.data) return direct.data;

  const byName = await supabase
    .from('prompt_sets')
    .select('id, name, description, owner_id, created_at')
    .ilike('name', input)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return byName.data || null;
}

function summarizeSlot(slot) {
  const parsed = parseTurnTemplate(slot.template || '', slot.slot_type || 'ai');
  return {
    id: slot.id,
    slotNo: slot.slot_no,
    slotType: slot.slot_type || 'ai',
    isStart: !!slot.is_start,
    invisible: !!slot.invisible,
    title: parsed.meta?.title || '',
    display: parsed.meta?.display || '',
    inputMode: parsed.meta?.inputMode || 'none',
    resultKey: parsed.meta?.resultKey || '',
    participantScope: parsed.meta?.participantScope || [],
    visibilityScope: parsed.meta?.visibilityScope || [],
    promptPreview: (parsed.body || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  };
}

function summarizeBridge(bridge) {
  return {
    id: bridge.id,
    from: bridge.from_slot_id,
    to: bridge.to_slot_id,
    priority: bridge.priority ?? 0,
    fallback: !!bridge.fallback,
    triggerWords: bridge.trigger_words || [],
    conditionCount: Array.isArray(bridge.conditions) ? bridge.conditions.length : 0,
    action: bridge.action || 'continue',
  };
}

async function inspectSet(setInput) {
  const setInfo = await resolveSetId(setInput);

  if (!setInfo) {
    console.error(`No prompt set found for: ${setInput}`);
    process.exit(1);
  }

  const { data: slots, error: slotsError } = await supabase
    .from('prompt_slots')
    .select('*')
    .eq('set_id', setInfo.id)
    .order('slot_no', { ascending: true });

  if (slotsError) throw slotsError;

  const { data: bridges, error: bridgesError } = await supabase
    .from('prompt_bridges')
    .select('*')
    .eq('from_set', setInfo.id)
    .order('priority', { ascending: false });

  if (bridgesError) throw bridgesError;

  const summary = {
    set: setInfo,
    slotCount: slots.length,
    bridgeCount: bridges.length,
    startSlots: slots.filter(slot => slot.is_start).map(slot => slot.id),
    slots: slots.map(summarizeSlot),
    bridges: bridges.map(summarizeBridge),
  };

  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const setInput = process.argv.slice(2).join(' ').trim();

  if (!setInput) {
    console.error('Usage: node scripts/inspect-maker-battle.js <set-id-or-name>');
    process.exit(1);
  }

  await inspectSet(setInput);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

// Simple in-memory devices store with optional Supabase persistence
let supabaseAdmin = null;
try {
  supabaseAdmin = require('./supabaseAdmin').supabase;
} catch (e) {
  supabaseAdmin = null;
}

const devices = new Map();

function saveDevice(obj) {
  // obj: { deviceId, displayName, token, iat, exp }
  try {
    if (supabaseAdmin && supabaseAdmin.from) {
      // try to persist; don't await here (caller may await separately)
      return supabaseAdmin.from('devices').insert([obj]).then(r => ({ ok: true, row: r.data && r.data[0] }));
    }
  } catch (e) {}
  devices.set(obj.token, obj);
  return Promise.resolve({ ok: true, row: obj });
}

function getDeviceByToken(token) {
  try {
    if (supabaseAdmin && supabaseAdmin.from) {
      return supabaseAdmin
        .from('devices')
        .select('*')
        .eq('token', token)
        .limit(1)
        .then(r => ({ ok: !r.error, row: (r.data && r.data[0]) || null }));
    }
  } catch (e) {}
  return Promise.resolve({ ok: true, row: devices.get(token) || null });
}

function removeDeviceByToken(token) {
  try {
    if (supabaseAdmin && supabaseAdmin.from) {
      return supabaseAdmin.from('devices').delete().eq('token', token).then(r => ({ ok: !r.error, row: null }));
    }
  } catch (e) {}
  const had = devices.delete(token);
  return Promise.resolve({ ok: true, removed: had });
}

function listDevices() {
  try {
    if (supabaseAdmin && supabaseAdmin.from) {
      return supabaseAdmin.from('devices').select('*').then(r => ({ ok: !r.error, rows: r.data || [] }));
    }
  } catch (e) {}
  return Promise.resolve({ ok: true, rows: Array.from(devices.values()) });
}

async function saveEvent(evt) {
  // evt: { device_token, device_id, event_type, detail, actor }
  try {
    if (supabaseAdmin && supabaseAdmin.from) {
      const { data, error } = await supabaseAdmin.from('device_events').insert([evt]).select().single();
      if (error) throw error;
      return { ok: true, row: data };
    }
  } catch (e) {
    // fallthrough to in-memory
  }
  // in-memory fallback: attach to device map under a special key
  const key = `evt:${Date.now()}:${Math.floor(Math.random()*10000)}`;
  devices.set(key, { __event: true, ...evt });
  return { ok: true, row: { id: key, ...evt } };
}

async function listEvents(limit = 100) {
  try {
    if (supabaseAdmin && supabaseAdmin.from) {
      const { data, error } = await supabaseAdmin.from('device_events').select('*').order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return { ok: true, rows: data };
    }
  } catch (e) {
    // fallthrough to in-memory
  }
  // collect in-memory events from devices map keys starting with evt:
  const rows = [];
  for (const [k, v] of devices.entries()) {
    if (v && v.__event) rows.push({ id: k, ...v });
  }
  // sort by id (best-effort) and limit
  rows.sort((a, b) => (a.id < b.id ? 1 : -1));
  return { ok: true, rows: rows.slice(0, limit) };
}

module.exports = { saveDevice, getDeviceByToken, removeDeviceByToken, listDevices, saveEvent, listEvents };

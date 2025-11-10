// Simple in-memory authority room store (MVP)
// Note: For production, replace with Redis/DB-backed store and a real tick loop.

const rooms = new Map(); // id -> { id, createdAt, seq, state, players: Map, events: [] }

function now(){ return Date.now(); }

export function createRoom(id, init = {}){
  const rid = String(id || `room_${Math.random().toString(36).slice(2)}`);
  if (rooms.has(rid)) return rooms.get(rid);
  const room = {
    id: rid,
    createdAt: now(),
    seq: 0,
    state: init.state || { objects: [], meta: {} },
    players: new Map(), // userId -> { joinedAt, data }
    events: [], // append-only log (bounded)
  };
  rooms.set(rid, room);
  return room;
}

export function getRoom(id){ return rooms.get(String(id)); }

export function joinRoom(id, user){
  const room = getRoom(id) || createRoom(id);
  const uid = String(user?.id || `u_${Math.random().toString(36).slice(2)}`);
  room.players.set(uid, { joinedAt: now(), data: user||{} });
  room.seq++;
  return { room, userId: uid };
}

export function appendEvent(id, event){
  const room = getRoom(id) || createRoom(id);
  const ev = { id: `e_${Math.random().toString(36).slice(2)}`, ts: now(), ...event };
  room.events.push(ev);
  // keep last N
  if (room.events.length > 1000) room.events.splice(0, room.events.length - 1000);
  // naive authority apply hook: update state if type matches a few known ops
  try {
    if (ev.type === 'move' && ev.payload && typeof ev.payload.id === 'string') {
      const obj = (room.state.objects||[]).find(o => o.id === ev.payload.id);
      if (obj) { obj.x = (obj.x||0) + (ev.payload.dx||0); obj.y = (obj.y||0) + (ev.payload.dy||0); }
    }
  } catch {}
  room.seq++;
  return { room, event: ev };
}

export function getSnapshot(id){
  const room = getRoom(id);
  if (!room) return null;
  return {
    id: room.id,
    seq: room.seq,
    players: Array.from(room.players.entries()).map(([uid, data]) => ({ id: uid, ...data })),
    state: room.state,
    events: room.events.slice(-64),
  };
}


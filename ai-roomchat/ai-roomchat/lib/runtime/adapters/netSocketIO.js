export function createNetSocketIO(io, { url, room } = {}){
  if (!io) return null;
  let socket = null;
  const handlers = new Map(); // event -> Set(cb)
  const queue = [];
  const emitLocal = (ev, payload) => { const set = handlers.get(ev); if (!set) return; set.forEach(cb=>{ try{ cb(payload); }catch{} }); };
  return {
    async connect(){
      socket = io(url || undefined, { transports:['websocket'], autoConnect:true, reconnection:true });
      socket.on('connect', ()=>{ emitLocal('connect'); try { if (room) socket.emit('join', { room }); } catch {} while (queue.length){ const { event, payload } = queue.shift(); try { socket.emit(event, payload); } catch {} } });
      socket.on('disconnect', (reason)=>emitLocal('disconnect', { reason }));
      socket.on('reconnect_attempt', (n)=>emitLocal('status', { type:'reconnect_attempt', n }));
      socket.on('reconnect', (n)=>emitLocal('status', { type:'reconnect', n }));
      socket.on('connect_error', (e)=>emitLocal('status', { type:'error', message: String(e?.message||e) }));
      socket.on('evt', (p)=>emitLocal('evt', p));
    },
    on(event, cb){ const set = handlers.get(event) || new Set(); set.add(cb); handlers.set(event, set); return () => { set.delete(cb); }; },
    publish(event, payload){ if (socket && socket.connected) socket.emit(event || 'evt', payload); else queue.push({ event: event||'evt', payload }); emitLocal(event||'evt', payload); },
    disconnect(){ try{ socket?.disconnect(); }catch{} socket=null; },
  };
}

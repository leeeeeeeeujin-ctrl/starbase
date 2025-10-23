const STORAGE_KEY = 'rank-arcade:queue-ticket';

export function persistTicket(ticket) {
  if (typeof window === 'undefined') return;
  try {
    if (!ticket) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket));
    }
  } catch (error) {
    console.error('persistTicket failed', error);
  }
}

export function readTicket() {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('readTicket failed', error);
    return null;
  }
}

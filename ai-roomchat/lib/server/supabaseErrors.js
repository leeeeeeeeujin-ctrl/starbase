export function isMissingSupabaseTable(error) {
  if (!error) return false;
  const code = error.code ? String(error.code) : '';
  if (code === '42P01') {
    return true;
  }
  const message = (error.message || '').toLowerCase();
  return message.includes('relation') && message.includes('does not exist');
}

export function isMissingSupabaseFunction(error) {
  if (!error) return false;
  const code = error.code ? String(error.code) : '';
  if (code === '42883' || code === 'PGRST116') {
    return true;
  }
  const message = (error.message || '').toLowerCase();
  return message.includes('function') && message.includes('does not exist');
}

export function isMissingSupabaseColumn(error) {
  if (!error) return false;
  const code = error.code ? String(error.code) : '';
  if (code === '42703') {
    return true;
  }
  const message = (error.message || '').toLowerCase();
  return message.includes('column') && message.includes('does not exist');
}

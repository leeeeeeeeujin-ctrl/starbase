export async function fetchStarterPack() {
  const res = await fetch('/api/workspace/starter-pack');
  if (!res.ok) throw new Error(`starter-pack ${res.status}`);
  const json = await res.json();
  return json.files || [];
}

// Utility to partition files by readonly flag
export function splitByReadonly(files) {
  const editable = [];
  const readonly = [];
  for (const f of files) (f.readonly ? readonly : editable).push(f);
  return { editable, readonly };
}


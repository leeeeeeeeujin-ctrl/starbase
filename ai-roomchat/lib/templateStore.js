export function loadTemplate(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTemplate(key, data) {
  if (typeof window === "undefined") return false;
  try {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    window.localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export async function importFromFile(file) {
  if (!file) return null;
  const text = await file.text();
  return JSON.parse(text);
}

export function exportToFile(filename, data) {
  if (typeof window === "undefined") return false;
  const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}


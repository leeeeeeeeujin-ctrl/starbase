const CSV_SEPARATOR = ',';

export function parseHeroIdCsv(value) {
  if (!value) {
    return [];
  }

  return value
    .split(CSV_SEPARATOR)
    .map(item => item.trim())
    .filter(Boolean);
}

export function stringifyHeroIds(ids) {
  return ids.join(`${CSV_SEPARATOR} `);
}

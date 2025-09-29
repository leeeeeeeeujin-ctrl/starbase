export function isMissingColumnError(error, columns = []) {
  if (!error) return false
  if (error.code === '42703') return true // undefined column

  const merged = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  if (!merged.includes('does not exist') && !merged.includes('not exist')) return false
  if (!merged.includes('column')) return false

  if (!columns || columns.length === 0) return true

  return columns.some((column) => {
    const needle = `"${column.toLowerCase()}"`
    return merged.includes(`column ${needle}`) || merged.includes(`column ${column.toLowerCase()}`)
  })
}


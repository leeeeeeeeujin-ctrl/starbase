// Simple prompt renderer supporting {{path.to.value}} substitutions from an input object.
function lookupPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj)
}

function escapeStringForPrompt(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function renderTemplate(template, input = {}) {
  if (!template) return ''
  // Replace {{ var.path }} with the value from input
  return template.replace(/{{\s*([a-zA-Z0-9_.$]+)\s*}}/g, (match, path) => {
    const val = lookupPath(input, path.replace(/\$/g, ''))
    return escapeStringForPrompt(val)
  })
}

module.exports = { renderTemplate }

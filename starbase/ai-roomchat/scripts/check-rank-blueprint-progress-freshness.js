#!/usr/bin/env node
/**
 * Validate that data/rankBlueprintProgress.json is still within the
 * acceptable freshness window. Exits with a non-zero status when the
 * snapshot is older than the configured threshold so CI can alert
 * maintainers.
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const snapshotPath = path.join(rootDir, 'data', 'rankBlueprintProgress.json')
const defaultMaxAgeDays = Number(process.env.BLUEPRINT_PROGRESS_MAX_AGE_DAYS || '14')

function readSnapshot() {
  try {
    const contents = fs.readFileSync(snapshotPath, 'utf8')
    return JSON.parse(contents)
  } catch (error) {
    console.error(`Unable to read or parse ${snapshotPath}:`, error.message)
    throw error
  }
}

function calculateAgeDays(isoDate) {
  if (!isoDate) {
    throw new Error('Snapshot is missing the lastUpdatedISO field.')
  }

  const updatedAt = new Date(isoDate)
  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error(`Invalid ISO timestamp in snapshot: ${isoDate}`)
  }

  const now = new Date()
  const diffMs = now.getTime() - updatedAt.getTime()
  if (diffMs <= 0) {
    return 0
  }

  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function main() {
  const snapshot = readSnapshot()
  const ageDays = calculateAgeDays(snapshot.lastUpdatedISO)
  const maxAgeDays = Number.isNaN(defaultMaxAgeDays) ? 14 : defaultMaxAgeDays

  if (ageDays > maxAgeDays) {
    console.error(
      `rankBlueprintProgress.json is ${ageDays} days old (threshold: ${maxAgeDays} days). ` +
        'Run "npm run refresh:blueprint-progress" to regenerate the snapshot.'
    )
    process.exitCode = 1
    return
  }

  console.log(
    `rankBlueprintProgress.json is ${ageDays} days old (threshold: ${maxAgeDays} days). Freshness within acceptable range.`
  )
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

#!/usr/bin/env node
// Compare the app's camera pulse with a reference: a finger pulse oximeter, a chest strap, or
// rPPG-Toolbox run offline on a recording of the same session. No dependencies.
//
// Usage
//   node scripts/compare-pulse.mjs <app.csv> <reference.csv> [options]
//
//   app.csv        the file from "Download CSV" on the Pulse view: timestamp_ms,time_s,bpm,quality
//   reference.csv  a header row and at least a time column and a pulse column, for example
//                  time_s,bpm  or  timestamp_ms,bpm  (also accepted: time, t, hr, pulse, heart_rate)
//
// Options
//   --offset=<s>       seconds added to the reference times before matching (default 0)
//   --window=<s>       largest time difference allowed for a pair, seconds (default 1)
//   --min-quality=<q>  ignore app readings below this quality, 0 to 1 (default 0)
//   --clock=<mode>     "wall" matches on timestamp_ms, "relative" on time_s (default: wall when
//                      both files have timestamp_ms, otherwise relative)
//   --json             print the results as JSON
//
// Each app reading is paired with the nearest reference reading in time. The script prints the
// number of pairs, MAE, RMSE, MAPE, Pearson r and the Bland-Altman bias with 95% limits of
// agreement (bias +/- 1.96 standard deviations of the differences).

import { readFileSync } from 'node:fs'

const TIME_WALL = ['timestamp_ms', 'epoch_ms', 'unix_ms']
const TIME_REL = ['time_s', 'time', 't', 'seconds', 'sec']
const PULSE = ['bpm', 'hr', 'heart_rate', 'heartrate', 'pulse', 'pulse_rate', 'pr']

function fail(message) {
  console.error(`compare-pulse: ${message}`)
  process.exit(1)
}

function options(argv) {
  const files = []
  const opts = { offset: 0, window: 1, minQuality: 0, clock: null, json: false }
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      files.push(arg)
      continue
    }
    const [key, value = ''] = arg.slice(2).split('=')
    const number = Number(value)
    if (key === 'json') opts.json = true
    else if (key === 'offset' && Number.isFinite(number)) opts.offset = number
    else if (key === 'window' && number > 0) opts.window = number
    else if (key === 'min-quality' && number >= 0 && number <= 1) opts.minQuality = number
    else if (key === 'clock' && (value === 'wall' || value === 'relative')) opts.clock = value
    else fail(`unknown or invalid option ${arg}`)
  }
  if (files.length !== 2)
    fail('expected two files: <app.csv> <reference.csv>. See the comment at the top of the script.')
  return { files, opts }
}

/** Reads a CSV with a header row. Accepts commas or semicolons (with decimal commas). */
function readCsv(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    fail(`cannot read ${path}`)
  }
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  if (lines.length < 2) fail(`${path} has no data rows`)
  const delimiter = lines[0].includes(';') ? ';' : ','
  const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map((line) =>
    line.split(delimiter).map((cell) => {
      const v = cell.trim().replace(/^"|"$/g, '')
      return Number(delimiter === ';' ? v.replace(',', '.') : v)
    }),
  )
  return { header, rows }
}

function column(header, names) {
  for (const name of names) {
    const i = header.indexOf(name)
    if (i !== -1) return i
  }
  return -1
}

function series(path, csv, clock, scaleRelative) {
  const wall = column(csv.header, TIME_WALL)
  const rel = column(csv.header, TIME_REL)
  const pulse = column(csv.header, PULSE)
  const quality = column(csv.header, ['quality'])
  if (pulse === -1) fail(`${path}: no pulse column (expected one of ${PULSE.join(', ')})`)
  const timeCol = clock === 'wall' ? wall : rel
  if (timeCol === -1) fail(`${path}: no ${clock === 'wall' ? 'timestamp_ms' : 'time_s'} column`)
  const points = []
  for (const row of csv.rows) {
    const t = clock === 'wall' ? row[timeCol] / 1000 : row[timeCol] * scaleRelative
    const bpm = row[pulse]
    if (!Number.isFinite(t) || !Number.isFinite(bpm) || bpm <= 0) continue
    points.push({ t, bpm, quality: quality === -1 ? 1 : row[quality] })
  }
  return points.sort((a, b) => a.t - b.t)
}

function nearest(sorted, t) {
  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid].t < t) lo = mid + 1
    else hi = mid
  }
  const candidates = [sorted[lo - 1], sorted[lo]].filter(Boolean)
  return candidates.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best))
}

function stats(pairs) {
  const n = pairs.length
  const d = pairs.map((p) => p.app - p.ref)
  const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length
  const bias = mean(d)
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - bias) ** 2, 0) / (n - 1))
  const ma = mean(pairs.map((p) => p.app))
  const mr = mean(pairs.map((p) => p.ref))
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of pairs) {
    sxy += (p.app - ma) * (p.ref - mr)
    sxx += (p.app - ma) ** 2
    syy += (p.ref - mr) ** 2
  }
  return {
    pairs: n,
    maeBpm: mean(d.map(Math.abs)),
    rmseBpm: Math.sqrt(mean(d.map((v) => v * v))),
    mapePct: 100 * mean(pairs.map((p) => Math.abs(p.app - p.ref) / p.ref)),
    pearsonR: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null,
    biasBpm: bias,
    loaLowBpm: bias - 1.96 * sd,
    loaHighBpm: bias + 1.96 * sd,
    within5BpmPct: (100 * d.filter((v) => Math.abs(v) <= 5).length) / n,
    meanAppBpm: ma,
    meanReferenceBpm: mr,
  }
}

const { files, opts } = options(process.argv.slice(2))
const [appPath, refPath] = files
const appCsv = readCsv(appPath)
const refCsv = readCsv(refPath)
const bothWall = column(appCsv.header, TIME_WALL) !== -1 && column(refCsv.header, TIME_WALL) !== -1
const clock = opts.clock ?? (bothWall ? 'wall' : 'relative')
// A reference "time" column in milliseconds is converted when its values are clearly not seconds.
const refRelative = column(refCsv.header, TIME_REL)
const looksMs =
  clock === 'relative' &&
  refRelative !== -1 &&
  refCsv.header[refRelative] !== 'time_s' &&
  refCsv.rows.some((r) => r[refRelative] > 100000)
const app = series(appPath, appCsv, clock, 1).filter((p) => p.quality >= opts.minQuality)
const ref = series(refPath, refCsv, clock, looksMs ? 0.001 : 1).map((p) => ({ ...p, t: p.t + opts.offset }))
if (app.length === 0) fail(`${appPath}: no usable readings`)
if (ref.length === 0) fail(`${refPath}: no usable readings`)

const pairs = []
for (const a of app) {
  const r = nearest(ref, a.t)
  if (Math.abs(r.t - a.t) <= opts.window) pairs.push({ t: a.t, app: a.bpm, ref: r.bpm })
}
if (pairs.length < 3)
  fail(
    `only ${pairs.length} matched pair(s). Check that both files cover the same period, the --clock mode (${clock}) and --offset.`,
  )

const result = {
  clock,
  offsetS: opts.offset,
  windowS: opts.window,
  minQuality: opts.minQuality,
  ...stats(pairs),
}
if (opts.json) {
  console.log(JSON.stringify(result, null, 2))
} else {
  const f = (v, digits = 1) => (v === null ? 'n/a' : v.toFixed(digits))
  console.log(`Camera pulse vs reference (${clock} clock, window ${opts.window} s, offset ${opts.offset} s)`)
  console.log(`  Pairs                 ${result.pairs}`)
  console.log(`  Mean app / reference  ${f(result.meanAppBpm)} / ${f(result.meanReferenceBpm)} bpm`)
  console.log(`  MAE                   ${f(result.maeBpm, 2)} bpm`)
  console.log(`  RMSE                  ${f(result.rmseBpm, 2)} bpm`)
  console.log(`  MAPE                  ${f(result.mapePct, 2)} %`)
  console.log(`  Pearson r             ${f(result.pearsonR, 3)}`)
  console.log(`  Bland-Altman bias     ${f(result.biasBpm, 2)} bpm`)
  console.log(`  95% limits            ${f(result.loaLowBpm, 2)} to ${f(result.loaHighBpm, 2)} bpm`)
  console.log(`  Within 5 bpm          ${f(result.within5BpmPct, 1)} % of pairs`)
}

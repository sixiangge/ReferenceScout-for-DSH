import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const benchmarkRoot = join(root, 'benchmarks', 'quality-ab')
const dshHome = join(process.env.USERPROFILE ?? '', '.dsh')
const projectionRoot = join(dshHome, 'storages', 'session_projcache', 'sessions')
const task = (await readFile(join(benchmarkRoot, 'task.txt'), 'utf8')).trim()
const pnpmEntry = join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
const completionTimeoutMs = 240_000

const allVariants = [
  { name: 'baseline', profile: 'rs-bench-base', cwd: join(benchmarkRoot, 'baseline') },
  { name: 'with-plugin', profile: 'rs-bench-scout', cwd: join(benchmarkRoot, 'with-plugin') },
]
const selectedVariant = process.argv[2]
const variants = selectedVariant === undefined
  ? allVariants
  : allVariants.filter(variant => variant.name === selectedVariant)
if (variants.length === 0) throw new Error(`Unknown benchmark variant: ${selectedVariant}`)

function runPnpm(args, cwd) {
  const result = spawnSync(process.execPath, [pnpmEntry, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  })
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms))
}

function terminateProcessTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  } else {
    process.kill(pid, 'SIGTERM')
  }
}

async function sourceSignature(cwd) {
  const files = ['src/index.ts', 'src/async-ttl-cache.ts']
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file)
    try {
      hash.update(await readFile(join(cwd, file)))
    } catch {
      hash.update('<missing>')
    }
  }
  return hash.digest('hex')
}

async function runDsh(variant) {
  const startedAt = Date.now()
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-Command',
    '& $env:DSH_BENCH_NODE $env:DSH_BENCH_PNPM dlx "@deepseek-ai/dsh@0.1.5-rc.2" --profile $env:DSH_BENCH_PROFILE $env:DSH_BENCH_TASK',
  ], {
    cwd: variant.cwd,
    env: {
      ...process.env,
      DSH_PERMISSION_MODE: 'workspace-write',
      DSH_BENCH_NODE: process.execPath,
      DSH_BENCH_PNPM: pnpmEntry,
      DSH_BENCH_PROFILE: variant.profile,
      DSH_BENCH_TASK: task,
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let exited = false
  let exitCode = null
  child.stdout.on('data', chunk => { stdout += chunk.toString() })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  child.on('exit', code => { exited = true; exitCode = code })

  let consecutivePasses = 0
  let passingSignature
  let stopReason = 'process-exit'
  while (!exited && Date.now() - startedAt < completionTimeoutMs) {
    await delay(8_000)
    const tests = runPnpm(['test', '--', '--run'], variant.cwd)
    const typecheck = runPnpm(['typecheck'], variant.cwd)
    const signature = await sourceSignature(variant.cwd)
    if (tests.exitCode === 0 && typecheck.exitCode === 0) {
      consecutivePasses = signature === passingSignature ? consecutivePasses + 1 : 1
      passingSignature = signature
    } else {
      consecutivePasses = 0
      passingSignature = undefined
    }
    console.log(`[benchmark] ${variant.name}: stable completion probe ${consecutivePasses}/4`)
    if (consecutivePasses >= 4) {
      stopReason = 'tests-and-typecheck-passed'
      break
    }
  }

  if (!exited) {
    if (Date.now() - startedAt >= completionTimeoutMs) stopReason = 'timeout'
    terminateProcessTree(child.pid)
    await Promise.race([
      new Promise(resolveExit => child.once('exit', resolveExit)),
      delay(5_000),
    ])
  }
  return {
    exitCode: stopReason === 'tests-and-typecheck-passed' ? 0 : (exitCode ?? 1),
    elapsedMs: Date.now() - startedAt,
    stdout,
    stderr,
    stopReason,
  }
}

async function findProjection(cwd, startedAt) {
  const files = await readdir(projectionRoot)
  const candidates = []
  for (const file of files) {
    if (!file.startsWith('session-') || !file.endsWith('.json')) continue
    const path = join(projectionRoot, file)
    const info = await stat(path)
    if (info.mtimeMs < startedAt - 5_000) continue
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (resolve(value.record?.identity?.cwd ?? '') !== resolve(cwd)) continue
    candidates.push({ path, value, mtimeMs: info.mtimeMs })
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return candidates[0]
}

function testCounts(output) {
  try {
    const report = JSON.parse(output)
    return {
      passed: Number(report.numPassedTests ?? 0),
      failed: Number(report.numFailedTests ?? 0),
      total: Number(report.numTotalTests ?? 0),
    }
  } catch {
    return { passed: 0, failed: 0, total: 0 }
  }
}

const results = []
for (const variant of variants) {
  console.log(`[benchmark] starting ${variant.name}`)
  const startedAt = Date.now()
  const dsh = await runDsh(variant)
  await writeFile(join(benchmarkRoot, `${variant.name}.assistant.txt`), dsh.stdout)
  await writeFile(join(benchmarkRoot, `${variant.name}.reasoning.log`), dsh.stderr)

  const ownTests = runPnpm(['exec', 'vitest', 'run', '--reporter=json'], variant.cwd)
  await mkdir(join(variant.cwd, 'tests'), { recursive: true })
  await cp(join(benchmarkRoot, 'hidden', 'async-ttl-cache.hidden.spec.ts'), join(variant.cwd, 'tests', 'async-ttl-cache.hidden.spec.ts'))
  const hidden = runPnpm(['exec', 'vitest', 'run', 'tests/async-ttl-cache.hidden.spec.ts', '--reporter=json'], variant.cwd)
  const typecheck = runPnpm(['typecheck'], variant.cwd)
  const projection = await findProjection(variant.cwd, startedAt)
  const totals = projection?.value?.record?.rows?.tokenUsage?.val?.totals ?? {}
  const turnBoundary = projection?.value?.record?.rows?.turnBoundary?.val ?? {}
  const lastTokenUsage = projection?.value?.record?.rows?.tokenUsage?.val?.last ?? {}
  const counts = testCounts(hidden.stdout)
  const ownCounts = testCounts(ownTests.stdout)
  const projectionText = projection === undefined ? '' : JSON.stringify(projection.value)
  const result = {
    name: variant.name,
    profile: variant.profile,
    dshExitCode: dsh.exitCode,
    stopReason: dsh.stopReason,
    elapsedMs: dsh.elapsedMs,
    ownTests: { exitCode: ownTests.exitCode, ...ownCounts },
    hiddenTests: { exitCode: hidden.exitCode, ...counts },
    typecheckExitCode: typecheck.exitCode,
    tokens: {
      uncachedInput: Number(totals.uncachedInputTokens ?? 0),
      cacheRead: Number(totals.cacheReadTokens ?? 0),
      cacheWrite: Number(totals.cacheWriteTokens ?? 0),
      output: Number(totals.outputTokens ?? 0),
    },
    turns: Number(turnBoundary.lastTurn ?? 0),
    steps: Number(lastTokenUsage.step ?? 0),
    sessionProjection: projection?.path,
    referenceScoutObserved: /research_reference|reference-scout|Reference Scout/i.test(`${projectionText}\n${dsh.stderr}`),
    referenceResearchStatus: /No references/i.test(dsh.stderr)
      ? 'no-results'
      : (/research_reference|reference-scout|Reference Scout/i.test(`${projectionText}\n${dsh.stderr}`) ? 'observed' : 'not-observed'),
    finalResponseChars: dsh.stdout.length,
    hiddenTestOutput: hidden.stdout,
    hiddenTestError: hidden.stderr,
    typecheckOutput: `${typecheck.stdout}${typecheck.stderr}`,
  }
  results.push(result)
  console.log(`[benchmark] ${variant.name}: ${counts.passed}/${counts.total} hidden tests, typecheck=${typecheck.exitCode}, tokens=${JSON.stringify(result.tokens)}`)
}

let mergedResults = results
if (selectedVariant !== undefined) {
  try {
    const previous = JSON.parse(await readFile(join(benchmarkRoot, 'results.json'), 'utf8'))
    mergedResults = [
      ...(Array.isArray(previous.results) ? previous.results : []).filter(result => result.name !== selectedVariant),
      ...results,
    ].sort((left, right) => allVariants.findIndex(item => item.name === left.name) - allVariants.findIndex(item => item.name === right.name))
  } catch {}
}
await writeFile(join(benchmarkRoot, 'results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), task, completionTimeoutMs, results: mergedResults }, null, 2)}\n`)
console.log(`[benchmark] results written to ${join(benchmarkRoot, 'results.json')}`)

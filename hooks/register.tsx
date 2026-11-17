import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Run, RunKind } from '../types'

const PANE = 'agent-runway'
const TITLE = 'Runway'

// Bump the shape tag whenever Run's fields change: a reload keeps $.state,
// and the tag makes this code decline what an older version stored.
const runs = atom({ plugin: 'agent-runway', key: 'runs' } as const, [], {
  shape: 'runs-1',
})
const frame = atom({ plugin: 'agent-runway', key: 'frame' } as const, 0, {
  shape: 'frame-1',
})

const TICK_MS = 140
const KEEP_DONE = 6
const CLAUDE = '#D97757'

// How long each kind usually takes. The bar is an estimate that eases toward
// 95% and only fills completely when the thing actually finishes.
const TYPICAL_MS: Record<RunKind, number> = {
  agent: 90_000,
  background: 60_000,
  tool: 6_000,
}

const AGENTS: Record<RunKind, number> = { agent: 4, background: 3, tool: 2 }
const ICON: Record<RunKind, string> = { agent: '◆', background: '◎', tool: '•' }

function classify(e: Record<string, unknown>): { kind: RunKind; label: string } {
  const tool = String(e.tool)
  const str = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
  if (tool === 'Agent' || tool === 'Task') {
    const type = str('subagent_type') || 'agent'
    return { kind: 'agent', label: `${type}: ${str('description') || 'subagent'}` }
  }
  if (e.run_in_background === true) {
    return { kind: 'background', label: str('description') || str('command') || tool }
  }
  const detail = str('description') || str('command') || str('file_path') || str('pattern')
  return { kind: 'tool', label: detail ? `${tool}: ${detail}` : tool }
}

function progress(run: Run, now: number): number {
  if (run.endedAt) return 1
  const t = Math.max(0, now - run.startedAt)
  return Math.min(0.95, 1 - Math.exp(-t / TYPICAL_MS[run.kind]))
}

function secs(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

// Three rows of cells for one run: the agents' track, the bar, and the drop.
function drawRunning(run: Run, width: number, tick: number) {
  const filled = Math.max(1, Math.round(progress(run, Date.now()) * width))
  const edge = Math.min(width - 1, filled)
  const track = Array<string>(width).fill(' ')
  const drop1 = Array<string>(width + 2).fill(' ')
  const drop2 = Array<string>(width + 2).fill(' ')
  const n = AGENTS[run.kind]
  const cycle = edge + 4 // run the length of the fill, then three steps of falling
  const spacing = Math.max(2, Math.floor(cycle / n))
  const seed = run.id.length * 7

  for (let i = 0; i < n; i++) {
    const phase = (tick + seed + i * spacing) % cycle
    if (phase <= edge) {
      track[phase] = phase === edge ? '✺' : '✻' // teeter at the edge
    } else {
      const step = phase - edge - 1 // 0, 1, 2: tumbling off
      if (step === 0) drop1[edge + 1] = '✻'
      else if (step === 1) drop2[edge + 1] = '⁎'
      else drop2[edge + 2] = '·'
    }
  }
  return {
    track: track.join(''),
    bar: '█'.repeat(filled),
    rest: '░'.repeat(Math.max(0, width - filled)),
    drop1: drop1.join('').trimEnd(),
    drop2: drop2.join('').trimEnd(),
  }
}

// Finished: a full bar, the crew lined up at the far end, the front one
// rocking on its heels, ready to be pushed off the edge of the next thing.
function drawDone(run: Run, width: number, tick: number) {
  const n = AGENTS[run.kind]
  const crew = Array.from({ length: n }, (_, i) =>
    i === n - 1 && Math.floor(tick / 4) % 2 === 0 ? '✺' : '✻',
  ).join('')
  return { track: ' '.repeat(Math.max(0, width - n)) + crew, bar: '█'.repeat(width) }
}

let timer: Timer | undefined

async function safe(p: Promise<unknown>): Promise<void> {
  await p.catch(() => undefined)
}

function ensureTicking($: EngineInterface) {
  if (timer) return
  timer = $.clock.every(TICK_MS, async () => {
    const list = await read($, runs)
    if (!list.some(r => !r.endedAt)) {
      timer?.cancel()
      timer = undefined
    }
    await update($, frame, n => (n + 1) % 1_000_000)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'runway',
      description: 'Open the Runway pane: everything running, with agents racing the bars',
    })
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'runway' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (opened.isPlaced) return { text: 'Runway pane opened.' }
    const surfaces = await $.session.surfaces()
    return {
      text:
        `Runway pane is open but not shown here (${opened.reason}). ` +
        `Connected apps: ${surfaces.length ? surfaces.join(', ') : 'none'}.`,
    }
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id ?? `${e.tool}-${Date.now()}-${Math.random()}`
    const { kind, label } = classify(e as unknown as Record<string, unknown>)
    const run: Run = { id, kind, label, startedAt: Date.now() }

    await safe(update($, runs, list => {
      const live = list.filter(r => !r.endedAt)
      const done = list.filter(r => r.endedAt).slice(-KEEP_DONE)
      return [...done, ...live, run]
    }))
    try {
      ensureTicking($)
    } catch {
      // animation is decoration; carry on without it
    }

    const ran = await next(e)
    const isError = 'isError' in ran && ran.isError === true

    await safe(
      update($, runs, list =>
        list.map(r => (r.id === id ? { ...r, endedAt: Date.now(), isError } : r)),
      ),
    )
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, runs)
    const tick = await read($, frame)
    const cols = e.viewport?.columns ?? 40
    const width = Math.max(10, Math.min(48, cols - 6))
    const now = Date.now()
    const live = list.filter(r => !r.endedAt)
    const done = list.filter(r => r.endedAt).slice(-KEEP_DONE).reverse()

    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          <Text color={CLAUDE} mono>{'✻✻✻'}</Text>
          <Text dimColor>Nothing running. The crew is waiting for a runway.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text weight="semibold">
          {live.length} running · {done.length} landed
        </Text>
        {live.map(run => {
          const d = drawRunning(run, width, tick)
          const pct = Math.round(progress(run, now) * 100)
          return (
            <Box key={`live-${run.id}`} flexDirection="column" marginTop={1}>
              <Text wrap="end">
                <Text color={CLAUDE}>{ICON[run.kind]} </Text>
                {run.label}
              </Text>
              <Text mono wrap="clip" color={CLAUDE}>{d.track}</Text>
              <Text mono wrap="clip">
                <Text color={CLAUDE}>{d.bar}</Text>
                <Text dimColor>{d.rest}</Text>
              </Text>
              <Text mono wrap="clip" color={CLAUDE}>{d.drop1 || ' '}</Text>
              <Text mono wrap="clip">
                <Text color={CLAUDE}>{d.drop2 || ' '}</Text>
              </Text>
              <Text dimColor tabular>
                ~{pct}% · {secs(now - run.startedAt)}
              </Text>
            </Box>
          )
        })}
        {done.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Landed</Text>
            {done.map(run => {
              const d = drawDone(run, width, tick)
              const color = run.isError ? 'error' : 'success'
              return (
                <Box key={`done-${run.id}`} flexDirection="column" marginTop={1}>
                  <Text wrap="end" dimColor>
                    <Text color={color}>{run.isError ? '✗' : '✓'} </Text>
                    {run.label}
                  </Text>
                  <Text mono wrap="clip" color={CLAUDE}>{d.track}</Text>
                  <Text mono wrap="clip" color={color}>{d.bar}</Text>
                  <Text dimColor tabular>
                    {run.isError ? 'failed' : 'done'} · {secs((run.endedAt ?? now) - run.startedAt)}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}

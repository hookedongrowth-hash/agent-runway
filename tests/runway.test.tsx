import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-runway',
  component: 'Pane',
  requestId: 'agent-runway',
  props: {
    title: 'Runway',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('empty pane shows the waiting crew', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Nothing running/ }))?.text).toContain('waiting')
    await ui.unmount()
  }
})

test('a finished subagent lands with a full bar and its crew lined up', async ($, on) => {
  on('command.register', () => ({ value: { command: 'runway' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Agent', subagent_type: 'Explore', description: 'map the repo', prompt: 'x' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Explore: map the repo/ }))?.text).toContain('✓')
    expect((await ui.find({ type: 'Text', text: /^█+$/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /✻✻✻/ }))?.text).toBeTruthy()
    await ui.unmount()
  }
})

test('a running background shell shows agents on a part-filled bar', async ($, on) => {
  let finish: () => void = () => {}
  const gate = new Promise<void>(r => (finish = r))
  on('clock.every', () => ({ value: { cancel: () => {} } }) as never)
  on('tool.call', async () => {
    await gate
    return { result: {} }
  })

  const call = $.tool.call({ tool: 'Bash', command: 'npm test', description: 'run tests', run_in_background: true })
  const wait = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout
  await new Promise<void>(r => wait(r, 20))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /1 running/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /░/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /[✻✺]/ }))?.text).toBeTruthy()
  await ui.unmount()

  finish()
  await call
})

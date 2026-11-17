export type RunKind = 'agent' | 'background' | 'tool'

export type Run = {
  id: string
  kind: RunKind
  label: string
  startedAt: number
  endedAt?: number
  isError?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-runway': {
      runs: Shaped<Run[]>
      frame: Shaped<number>
    }
  }
}

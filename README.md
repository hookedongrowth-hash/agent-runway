# Agent Runway

A side pane for Claude Code that shows everything currently running: subagents,
background shells and ordinary tool calls. Each one gets a progress bar with little
Claude agents (✻) sprinting along the filled part and tumbling off its leading edge.
When a run finishes, its bar fills completely and the crew lines up at the far end,
front agent rocking on its heels, ready to be pushed off the edge of the next thing.

The pane opens when the session starts; reopen it with `/runway`. Progress is an
estimate that eases toward 95% based on the kind of work, and only reaches 100% when
the work actually completes. Failed runs land in red.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install agent-runway --marketplace hookedongrowth-hash/agent-runway
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```bash
claude plugin install agent-runway --marketplace hookedongrowth-hash/agent-runway
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `hookedongrowth-hash/agent-runway`, then Add plugin.

## License

MIT

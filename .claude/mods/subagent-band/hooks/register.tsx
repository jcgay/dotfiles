import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentUsage } from '../types'
import { BAR_WIDTH, emoji, modelName, rgb, tokens, windowFor } from './format'

const agents = atom({ plugin: 'subagent-band', key: 'agents' } as const, {} as Record<string, AgentUsage>)
// In $.state, not a module variable: a mod reload would reset it to the 200k guess.
const mainModel = atom({ plugin: 'subagent-band', key: 'mainModel' } as const, null as string | null)
const LIVE = ['pending', 'running', 'waiting']

export const register: Register = on => {
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (!e.agentId) {
      if (e.model !== (await read($, mainModel))) await update($, mainModel, () => e.model)
    } else if (r.usage) {
      const u = r.usage
      const used = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const id = e.agentId
      await update($, agents, all => ({ ...all, [id]: { model: e.model, tokens: used } }))
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id) await update($, agents, ({ [id]: _, ...rest }) => rest)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const usage = await read($, agents)
    if (e.props.hasSurvey || Object.keys(usage).length === 0) return next(e)

    const running = (await $.agent.list()).filter(a => usage[a.id] && LIVE.includes(a.status))
    if (running.length === 0) return next(e)

    const mainWindow = (await $.session.usage()).context.window
    const main = (await read($, mainModel)) ?? undefined
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {running.map(a => {
          const { model, tokens: used } = usage[a.id]!
          const pct = Math.min(100, used / windowFor(model, main, mainWindow) * 100)
          const filled = Math.round(pct / 100 * BAR_WIDTH)
          return (
            <Box key={a.id}>
              <Text wrap="truncate-end">{a.name ?? a.description}</Text>
              <Text dimColor> · </Text>
              <Text>🤖 </Text><Text color="magenta">{modelName(model)}</Text>
              <Text dimColor> · </Text>
              {Array.from({ length: BAR_WIDTH }, (_, i) => (
                <Text key={String(i)} color={i < filled ? rgb(i * 100 / (BAR_WIDTH - 1)) : '#3c3c3c'}>█</Text>
              ))}
              <Text> {emoji(pct)} </Text>
              <Text color={rgb(pct)}>{pct.toFixed(0)}%</Text>
              <Text dimColor> {tokens(used)}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}

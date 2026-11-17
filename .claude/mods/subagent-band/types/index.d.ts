export type AgentUsage = { model: string; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'subagent-band': { agents: Record<string, AgentUsage>; mainModel: string | null }
  }
}

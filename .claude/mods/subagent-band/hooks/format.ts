// Pure helpers, no Herdr/engine imports, so the test can load them.
export const BAR_WIDTH = 10

export function rgb(pct: number): string {
  // green(0,200,80) -> yellow(220,200,0) -> red(220,40,20)
  const [r, g, b] = pct <= 50
    ? [220 * pct / 50, 200, 80 - 80 * pct / 50]
    : [220, 200 - 160 * (pct - 50) / 50, 20 * (pct - 50) / 50]
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export function emoji(pct: number): string {
  return pct >= 90 ? '🚨' : pct >= 70 ? '🔥' : pct >= 20 ? '⚡' : '🟢'
}

export function modelName(model: string): string {
  const wide = model.includes('[1m]')
  const s = model.replace('claude-', '').replace('[1m]', '').replace(/-\d{8}$/, '')
  const [family = '', ...version] = s.split('-')
  const name = `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version.join('.')}`.trim()
  return wide ? `${name} 1M` : name
}

export function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// shortcut: the engine does not give a subagent's window; 1M for an explicit [1m] or the
// session's own model (its window is known), else 200k. Upgrade if $ exposes it per agent.
export function windowFor(model: string, mainModel: string | undefined, mainWindow: number): number {
  if (model.includes('[1m]')) return 1_000_000
  return model === mainModel ? mainWindow : 200_000
}

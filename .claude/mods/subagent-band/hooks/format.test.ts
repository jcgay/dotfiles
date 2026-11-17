import { test, expect } from 'claude-code/testing'
import { modelName, rgb, tokens, windowFor } from './format'

test('formats like the old subagent-statusline.py', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-4-5-20250929[1m]')).toBe('Sonnet 4.5 1M')
  expect(tokens(950)).toBe('950')
  expect(tokens(12345)).toBe('12.3k')
  expect(rgb(0)).toBe('#00c850')
  expect(rgb(100)).toBe('#dc2814')
  expect(windowFor('claude-haiku-5-5', 'claude-opus-5-5', 1_000_000)).toBe(200_000)
  expect(windowFor('claude-opus-5-5', 'claude-opus-5-5', 1_000_000)).toBe(1_000_000)
})

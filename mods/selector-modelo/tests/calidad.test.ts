import { expect, test } from 'claude-code/testing'

import { isCodeFile, isVerification, runsEdited } from '../hooks/calidad'

test('tells code from docs', () => {
  expect(isCodeFile('/r/src/app.ts')).toBe(true)
  expect(isCodeFile('/r/main.py')).toBe(true)
  expect(isCodeFile('/r/index.html')).toBe(false)
  expect(isCodeFile('/r/estilos.css')).toBe(false)
  expect(isCodeFile('/r/README.md')).toBe(false)
  expect(isCodeFile('/r/docs/notes.txt')).toBe(false)
})

test('recognises verification commands', () => {
  for (const cmd of ['npm test', 'pytest -q', 'cargo test', 'npx tsc --noEmit', 'go vet ./...', 'make', 'ruff check .']) {
    expect(isVerification(cmd)).toBe(true)
  }
  for (const cmd of ['ls', 'git status', 'cat src/a.ts', 'mkdir out']) {
    expect(isVerification(cmd)).toBe(false)
  }
})

test('adds its rules to the system prompt', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' as const }] }))
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  const ids = composed.sections.map(s => s.id)
  expect(ids).toContain('selector-modelo:reglas')
})

test('running the edited file counts as checking it', () => {
  const edited = new Set(['/repo/scripts/cloud-setup.sh'])
  expect(runsEdited('bash -n scripts/cloud-setup.sh', edited)).toBe(true)
  expect(runsEdited('HOME=/x bash /repo/scripts/cloud-setup.sh | tail', edited)).toBe(true)
  expect(runsEdited('cat scripts/cloud-setup.sh', edited)).toBe(false)
  expect(runsEdited('bash other.sh', edited)).toBe(false)
})

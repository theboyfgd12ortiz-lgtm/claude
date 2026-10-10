import { describe, expect, mock, test } from 'claude-code/testing'

import { discardsWork, judgeCommand, judgeSecretPath } from './rules'

describe('rules', () => {
  test('blocks catastrophic commands', () => {
    for (const cmd of [
      'rm -rf /',
      'sudo true && rm -rf ~',
      'rm -fr $HOME',
      'rm --recursive --force /*',
      'git push --force origin main',
      'git push -f',
      'mkfs.ext4 /dev/sda1',
      'dd if=/dev/zero of=/dev/sda',
      'cat .env',
      'grep KEY .env.local',
      'cat ~/.ssh/id_rsa',
      'sudo rm -rf /',
      'bash -c "rm -rf ~"',
      'eval "git push --force"',
      'FOO=1 rm -rf $HOME',
    ]) {
      expect(judgeCommand(cmd)).toBeDefined()
    }
  })

  test('lets everyday commands through', () => {
    for (const cmd of [
      'rm -rf node_modules',
      'rm -rf ./dist build',
      'git push -u origin feature',
      'git push --force-with-lease origin feature',
      'cat .env.example',
      'ls -la',
      'npm test',
      'grep -rn "env" src',
      'cp .env.example .env',
      'echo "rm -rf /"',
      'git commit -m "docs: never run rm -rf / or mkfs"',
      'rtk rewrite "git push --force"',
      'grep -n "mkfs" notes.txt',
      'bash -c "ls -la"',
    ]) {
      expect(judgeCommand(cmd)).toBeUndefined()
    }
  })

  test('secret paths', () => {
    expect(judgeSecretPath('/app/.env')).toBeDefined()
    expect(judgeSecretPath('/app/.env.production')).toBeDefined()
    expect(judgeSecretPath('/home/u/.ssh/id_ed25519')).toBeDefined()
    expect(judgeSecretPath('/app/certs/server.pem')).toBeDefined()
    expect(judgeSecretPath('/app/.env.example')).toBeUndefined()
    expect(judgeSecretPath('/app/src/env.ts')).toBeUndefined()
    expect(judgeSecretPath('/app/src/keyboard.ts')).toBeUndefined()
  })

  test('work-discarding git commands', () => {
    expect(discardsWork('git reset --hard HEAD~1')).toBe(true)
    expect(discardsWork('git checkout -- .')).toBe(true)
    expect(discardsWork('git clean -fd')).toBe(true)
    expect(discardsWork('git reset HEAD file')).toBe(false)
    expect(discardsWork('git checkout main')).toBe(false)
  })
})

test('denies a destructive Bash call and runs a safe one', async ($, on) => {
  mock.clock(on)
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: 'ran', stderr: '', interrupted: false },
  }))

  const bad = await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  expect(bad.deny).toMatch(/guardian: blocked/)

  const good = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(good.deny).toBeUndefined()
  expect(good.text ?? (good.result as { stdout: string }).stdout).toMatch(/ran/)
})

test('denies reading a .env file even without a clock', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => ({ result: 'unused' as never }))
  const res = await $.tool.call({ tool: 'Read', file_path: '/repo/.env' })
  expect(res.deny).toMatch(/secretos/)
})

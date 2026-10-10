// Pure text and predicates: no `$`, so tests can call them directly.

export const RULES = `# Working rules (quality-coach)
- Understand first: read the relevant code, its callers and the project's conventions before changing anything. Ask only when a decision is genuinely the user's.
- Make the smallest change that fully solves the task, in the surrounding style. No unrequested refactors, no placeholder or half-done code.
- Verify before saying it is done: run the project's tests, linter, typecheck or build, or reproduce the behaviour. Report real results, failures included.
- Spend tokens where they count: search (Grep/Glob) before reading, read only the line ranges you need, never re-read an unchanged file, and pipe long command output through head, tail or grep. Do not paste code or file contents back to the user unless asked.
- Finish with the outcome first, then what changed and how it was verified, briefly. Reply in the user's language.`

export const COMPACT_HINT = `Keep in the summary: the user's goal, constraints and stated preferences; every file created or modified (path) and why; decisions taken and approaches rejected, with the reason; the commands that verify the work and their latest results; errors still open; the remaining steps. Leave out raw file contents and long tool outputs already acted on.`

const NOT_CODE = /\.(md|mdx|txt|rst|adoc|csv|log|lock|svg|html?|css|scss|png|jpe?g|gif|ico|pdf)$|(^|\/)(LICENSE|CHANGELOG|README)[^/]*$/i

/** Whether a file is source the project would test or build (docs and assets are not). */
export const isCodeFile = (path: string): boolean => !NOT_CODE.test(path)

/** Running or syntax-checking a file that was just edited (bash -n x.sh, node app.js, python x.py) checks it too. */
export const runsEdited = (command: string, edited: ReadonlySet<string>): boolean =>
  [...edited].some(path => {
    const name = path.split(/[\\/]/).pop() ?? ''

    // Look for the runner with the file's own name taken out, so "cat x.sh" is not read as "sh".
    return name !== '' && command.includes(name) && /\b(bash|sh|zsh|node|deno|bun|python3?|ruby|php|go run|tsc|shellcheck)\b/.test(command.split(name).join(' '))
  })

const VERIFY =
  /\b(test|tests|spec|pytest|jest|vitest|mocha|ava|tap|rspec|phpunit|ctest|tsc|eslint|biome|ruff|mypy|pyright|flake8|pylint|clippy|golangci-lint|rubocop|shellcheck|prettier\s+--check|bash\s+-n|cargo\s+(check|build|test)|go\s+(build|vet|test)|npm\s+(run|test|t)\b|pnpm|yarn|bun\s+(test|run)|make|gradle|gradlew|mvn|dotnet\s+(build|test)|swift\s+(build|test)|playwright|claude\s+plugin\s+(test|validate)|node\s+\S+\.(test|spec)\.|python3?\s+-m\s+(pytest|unittest|py_compile)|curl\s+.*localhost)\b/

/** Whether a shell command checks the work (tests, lint, typecheck, build, a local request). */
export const isVerification = (command: string): boolean => VERIFY.test(command)

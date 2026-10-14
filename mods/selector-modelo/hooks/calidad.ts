// Comprobaciones puras de calidad: sin `$`, para probarlas directamente.

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

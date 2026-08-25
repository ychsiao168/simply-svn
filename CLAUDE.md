# CLAUDE.md - Simply SVN

VSCode extension providing SVN integration that feels like the built-in Git support. TypeScript, MIT, early development.

## Architecture in one breath

`svn/svn.ts` (spawns the CLI) → `svn/parser.ts` (XML → typed objects) → `svn/svnRepository.ts` (per-working-copy facade) → `scm/`, `views/`, `statusBar.ts` (UI). `svnExtension.ts` owns the repository maps; `commands/index.ts` registers every command.

Foundational choices, unlikely to change: system `svn` CLI via `child_process.spawn` (no libsvn bindings), `--xml` output for everything parseable, public VSCode APIs only, cross-platform. Only the standard trunk/branches/tags layout is supported.

## Gotchas

### Build: two tools, one output path

`main` is `out/extension.js`, produced by **esbuild** (`npm run watch` / `package:ext`). `npm run compile` is typecheck-only (`tsc --noEmit`) — it deliberately emits nothing, because `tsc` and esbuild otherwise both write `out/extension.js` and tsc's unbundled stub would clobber the bundle. `.vscodeignore` ships only `!out/extension.js`, so a clobbered bundle packages a `.vsix` that fails at load with a missing-module error. Keep `--noEmit` (and `noEmit` in tsconfig) in place.

esbuild does **not** typecheck, so a type error bundles and ships silently — run `compile` as its own gate. There is no test suite; typecheck + lint + manual F5 is the verification loop.

`tsconfig.json` has `lib: ["ES2022"]` with no `DOM`. Reaching for browser globals fails to compile even though this is a VSCode extension.

### `Svn.exec()` never rejects

It always resolves `{exitCode, stdout, stderr}`; spawn errors become `exitCode: 1`. **Check `exitCode`** — `try/catch` around it catches nothing. Nothing in `svn.ts` throws on SVN failure; the return shape splits two ways:
- Query methods (`info`, `status`, `blame`, `log`) degrade a non-zero exit to `undefined` / `[]`, discarding the reason.
- Mutating methods (`add`, `commit`, `update`, `switch`, `resolve`) hand back the full `SvnExecResult` so the caller can read `stderr`. `diff()` is the odd one out: it returns `stdout` regardless of exit code, so a failed diff is an empty string.

Two consequences worth remembering:
- An empty array from `status()`/`blame()`/`getLog()` is ambiguous — it means "no entries" *or* "the command failed" *or* "the XML didn't parse". Only the output channel hints at which, and it logs the command and stderr but never stdout, so a parse failure on valid-looking output leaves no trace there (it goes to `console.error`).
- `--non-interactive` is prepended to every invocation, so SVN can never prompt. Auth failures are detected by sniffing stderr for `E215004` / `Authentication failed`; the user is told to run `svn info` in a terminal to cache credentials. Anything else that would have prompted just fails.

### Parsers: single-vs-array normalization is mandatory

`fast-xml-parser` yields a bare object when there's exactly one child element and an array when there are several. Every parser that reads a *repeating* element normalizes with `if (!Array.isArray(x)) x = [x]` — status entries, log entries, log paths, blame entries. Omit it and one-file working copies break while multi-file ones pass. (`SvnInfoParser` skips this by design: `svn info` on a single target has exactly one `entry`.) Attributes are prefixed `@_` (`attributeNamePrefix`), text content is `#text` — `SvnLogParser` handles a path arriving as either a bare string or an object.

Parsers swallow errors to `console.error` and return empty. Malformed XML looks identical to a clean working copy.

### The `svn:` URI scheme carries the revision in `query`

Diffs are built by taking a `file:` URI and doing `uri.with({scheme: 'svn', query: <revision>})`, where the revision is `BASE` or a number. `SvnContentProvider` reads `uri.query` back out (defaulting to `BASE`) and calls `svn cat`. This convention is the contract between `commands/index.ts`, `sourceControl.ts`, and `contentProvider.ts` — changing the query format breaks Quick Diff and the log-tree diffs together.

### Files without history must be suppressed, or SVN errors flood

`svn cat` fails on `unversioned` and `added` files (no BASE to fetch). `SvnSourceControl` tracks these in `noHistoryFiles` and gates three things: `provideOriginalResource` returns `undefined`, the content provider short-circuits via its `shouldSkip` callback, and the blame status bar hides. `statusReady` additionally suppresses Quick Diff until the first status completes — before that, every file would look history-less.

`noHistoryFiles` keys are **lowercased `fsPath`** (Windows case-insensitivity). Look up with the same casing or the guard silently misses.

`getRepositoryForFile` does *not* follow that rule: it case-folds only on Windows, since `/work/Repo` and `/work/repo` are usually distinct directories elsewhere and folding would let each claim the other's files. `process.platform` is only an approximation of case sensitivity — see the comment on `pathsAreCaseInsensitive` for which edges it gets wrong and why that is accepted. It also matches on path-segment boundaries (a bare prefix test attributed `/work/repo-other` to `/work/repo`) and, for nested working copies, returns the deepest containing root.

### Commit is explicitly scoped to the Changes group

`svn commit` with no paths commits the whole working copy, which picks up unrelated scheduled changes — notably `svn:mergeinfo` property changes on the working copy root, producing empty-looking revisions. `getCommittablePaths()` passes the Changes group's paths explicitly. Keep it that way. The Unversioned group is deliberately excluded (those need `add` first).

### `svn log` paths are repo-relative, not working-copy-relative

Log entries come back as e.g. `/trunk/src/foo.ts` while the working copy is checked out at `/trunk`. `simplySvn.diffRevision` derives the working-copy subpath by stripping `repositoryRoot` from `url`, then strips that prefix and any leading `/`. Skipping this yields paths like `<root>/trunk/trunk/...`. Diffs against revision *N* compare `N-1` → `N`, so r1 has no meaningful left side.

### Refresh is debounced, and concurrent svn processes are the main perf risk

A `**/*` file watcher schedules refreshes through a single trailing `setTimeout` (`simplySvn.refreshInterval`, default 3000ms; `simplySvn.autoRefresh` disables the watcher entirely). Too many concurrent `svn` processes spikes CPU — this is why refreshes coalesce and why blame results are cached per file in `SvnBlameStatusBar`.

Blame uses an `updateId` counter to drop stale async responses: increment on entry, compare before committing the result. Cursor movement fires `update()` far faster than `svn blame` returns, so without it the status bar shows the wrong line's author.

### Notification layering

`SvnRepository` shows the user-facing `showInformationMessage`/`showErrorMessage` for commit, update, switch, and createBranch, returning `boolean`. `Svn` stays UI-free apart from the auth warning. **Commands must not add their own toast** for these operations — the repository layer already reported it, and doing so double-notifies (this was the bug in `simplySvn.commit`). Commands only handle what the repository layer can't know about, e.g. clearing the input box.

One known rough edge: `getSelectedResources()` in `commands/index.ts` is a stub returning only the active editor's file, so SCM multi-select doesn't work for add/revert/delete when invoked without an explicit resource argument.

`listBranches()` takes the repository root as a parameter rather than calling `getInfo()` itself. Its caller has already fetched and reported on that info; a second lookup could fail silently after the first succeeded, leaving a trunk-only picker with nothing to indicate why.

## Conventions

4-space indent, single quotes, Prettier (`npm run format`) and ESLint (`npm run lint`) both configured. Everything disposable goes into a `disposables` array released in `dispose()`. Log through the shared `OutputChannel` ("Simply SVN"), not `console.log` — it's the user-visible debug trail and the only record of failed commands.

## References

- [VSCode SCM API](https://code.visualstudio.com/api/extension-guides/scm-provider) · [Extension API](https://code.visualstudio.com/api)
- [SVN Command Reference](https://svnbook.red-bean.com/en/1.7/svn.ref.html)
- [johnstoncode/svn-scm](https://github.com/JohnstonCode/svn-scm) — prior art

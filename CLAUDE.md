# CLAUDE.md - Simply SVN Project Guide

## Project Overview

**Simply SVN** is a VSCode extension that aims to provide SVN integration as natural as the built-in Git support.

- **Language**: TypeScript
- **License**: MIT
- **Status**: Early development

## Core Design Decisions

1. **Rely on system SVN CLI** - No libsvn bindings; calls `svn` commands via `child_process.spawn`
2. **Use `--xml` output** - SVN commands use the `--xml` flag for structured, parseable XML output
3. **No private VSCode APIs** - Only uses public, stable VSCode APIs for long-term maintainability
4. **Cross-platform** - Works on Windows, Linux, and macOS

## Project Structure

```
simply-svn/
├── src/
│   ├── extension.ts         # VSCode extension entry point
│   ├── svnExtension.ts      # Main extension class, manages repositories
│   ├── statusBar.ts         # Status bar (branch/revision) and blame display
│   ├── svn/
│   │   ├── svn.ts           # SVN CLI wrapper (core)
│   │   ├── parser.ts        # XML output parsers (status, info, log, blame)
│   │   ├── svnRepository.ts # Repository abstraction layer
│   │   └── index.ts
│   ├── scm/
│   │   ├── sourceControl.ts # VSCode SCM Provider implementation
│   │   ├── contentProvider.ts # Quick Diff content provider
│   │   └── index.ts
│   ├── views/
│   │   └── logTreeProvider.ts # SVN Log TreeView in SCM sidebar
│   └── commands/
│       └── index.ts         # Command registration and handling
├── package.json             # Extension manifest, commands, settings
├── tsconfig.json
└── .vscode/
    ├── launch.json          # F5 debug launch config
    └── tasks.json           # Build tasks
```

## Common Commands

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode (for development)
npm run watch

# Lint
npm run lint

# Package as .vsix
npm run package
```

## Development Workflow

1. Open the project: `code .`
2. Run `npm run watch` or let VSCode run it automatically
3. Press **F5** to launch the Extension Development Host
4. In the new VSCode window, open an SVN working copy to test

## Key Files

### `src/svn/svn.ts`
SVN CLI wrapper — all SVN operations go through here:
- `exec()` - Execute arbitrary svn commands
- `status()`, `info()`, `log()` - Query operations
- `commit()`, `update()`, `add()`, `revert()`, `delete()` - Working copy operations
- `switch()`, `copy()`, `resolve()` - Branch and conflict operations
- `blame()`, `cat()`, `diff()`, `ls()` - Content and history operations

### `src/svn/parser.ts`
Parses SVN XML output using `fast-xml-parser`:
- `SvnStatusParser` - Parses `svn status --xml`
- `SvnInfoParser` - Parses `svn info --xml`
- `SvnLogParser` - Parses `svn log --xml`
- `SvnBlameParser` - Parses `svn blame --xml`

### `src/scm/sourceControl.ts`
VSCode Source Control API integration:
- Creates the SCM Provider
- Manages resource groups (Changes, Unversioned, Conflicts)
- Implements Quick Diff

### `src/views/logTreeProvider.ts`
SVN Log TreeView in the SCM sidebar:
- Expandable commit entries showing changed files
- Click to diff any file at any revision

### `src/statusBar.ts`
Status bar integration:
- Left: branch name and revision (click to switch branch)
- Right: blame info for current line (author, revision, date)

### `package.json`
Defines the extension's:
- `activationEvents` - When to activate the extension
- `contributes.commands` - Command list
- `contributes.menus` - Menu placements
- `contributes.configuration` - Configuration settings

## Scope

This extension covers the most common SVN workflows: status, add, commit, revert, update, delete, log history, blame, branch operations (switch/create), and conflict resolution. Only standard trunk/branches/tags repository layout is supported.

## References

- [VSCode SCM API Docs](https://code.visualstudio.com/api/extension-guides/scm-provider)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [SVN Command Reference](https://svnbook.red-bean.com/en/1.7/svn.ref.html)
- [johnstoncode/svn-scm](https://github.com/JohnstonCode/svn-scm) - Prior art and reference implementation

## Notes

- Windows uses `\` for paths, but SVN and Node.js `path` module handle this
- SVN output encoding: set `LC_ALL=C` to ensure English output
- Avoid running too many svn processes concurrently (causes high CPU)

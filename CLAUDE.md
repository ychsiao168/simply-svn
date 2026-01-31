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
│   ├── extension.ts        # VSCode extension entry point
│   ├── svnExtension.ts     # Main extension class, manages repositories
│   ├── svn/
│   │   ├── svn.ts          # SVN CLI wrapper (core)
│   │   ├── parser.ts       # XML output parser
│   │   ├── svnRepository.ts # Repository abstraction layer
│   │   └── index.ts
│   ├── scm/
│   │   ├── sourceControl.ts # VSCode SCM Provider implementation
│   │   ├── contentProvider.ts # Quick Diff content provider
│   │   └── index.ts
│   └── commands/
│       └── index.ts        # Command registration and handling
├── package.json            # Extension manifest, commands, settings
├── tsconfig.json
└── .vscode/
    ├── launch.json         # F5 debug launch config
    └── tasks.json          # Build tasks
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
- `status()` - Get working copy status
- `commit()` - Commit changes
- `update()` - Update working copy

### `src/svn/parser.ts`
Parses SVN XML output using `fast-xml-parser`:
- `SvnStatusParser` - Parses `svn status --xml`
- `SvnInfoParser` - Parses `svn info --xml`

### `src/scm/sourceControl.ts`
VSCode Source Control API integration:
- Creates the SCM Provider
- Manages resource groups (Changes, Unversioned, Conflicts)
- Implements Quick Diff

### `package.json`
Defines the extension's:
- `activationEvents` - When to activate the extension
- `contributes.commands` - Command list
- `contributes.menus` - Menu placements
- `contributes.configuration` - Configuration settings

## Scope

This extension intentionally focuses on core, everyday SVN operations only: status, add, commit, revert, update, delete, and log history. Features beyond this scope (branching, blame, conflict resolution, etc.) are out of scope to keep the codebase simple and maintainable.

## References

- [VSCode SCM API Docs](https://code.visualstudio.com/api/extension-guides/scm-provider)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [SVN Command Reference](https://svnbook.red-bean.com/en/1.7/svn.ref.html)
- [johnstoncode/svn-scm](https://github.com/JohnstonCode/svn-scm) - Prior art and reference implementation

## Notes

- Windows uses `\` for paths, but SVN and Node.js `path` module handle this
- SVN output encoding: set `LC_ALL=C` to ensure English output
- Avoid running too many svn processes concurrently (causes high CPU)

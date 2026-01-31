# Simply SVN

**SVN integration that feels like built-in Git**

Simply SVN brings native-feeling Subversion support to VS Code, with a familiar workflow that mirrors the built-in Git experience.

## Scope

This extension covers the most common SVN workflows. Only the standard trunk/branches/tags repository layout is supported for branch operations.

## Features

- **Source Control View** - See all your changes in the familiar SCM sidebar
- **Quick Diff** - Gutter indicators showing what's changed
- **Core Operations** - Add, commit, revert, update, delete
- **SVN Log** - Browse commit history with expandable entries and per-file diffs
- **Blame** - Status bar shows author and revision for the current line
- **Branch Operations** - Switch and create branches (standard trunk/branches/tags layout)
- **Conflict Resolution** - Accept theirs, accept mine, or mark as resolved
- **Status Bar** - Shows current branch and revision

## Requirements

- **SVN CLI** must be installed and available in your PATH
  - Windows: Install [SlikSVN](https://sliksvn.com/), or [TortoiseSVN](https://tortoisesvn.net/) with "command line client tools" enabled
  - macOS: `brew install svn`
  - Linux: `apt install subversion`

## Installation

1. Download the latest `.vsix` from [GitHub Releases](https://github.com/ychsiao168/simply-svn/releases)
2. In VS Code, open the Command Palette (`Ctrl+Shift+P`) and run **Extensions: Install from VSIX...**
3. Select the downloaded `.vsix` file

## Usage

1. Open a folder containing an SVN working copy
2. The SVN icon will appear in the Source Control sidebar
3. Use the familiar Git-like workflow:
   - View changes in the sidebar
   - Stage files by clicking `+`
   - Enter commit message and click ✓
   - Pull updates with the cloud icon

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `simplySvn.enabled` | `true` | Enable/disable SVN integration |
| `simplySvn.path` | `svn` | Path to SVN executable |
| `simplySvn.autoRefresh` | `true` | Auto-refresh on file changes |
| `simplySvn.refreshInterval` | `3000` | Auto-refresh interval (ms) |

## Commands

| Command | Description |
|---------|-------------|
| `SVN: Refresh` | Refresh the status |
| `SVN: Commit` | Commit changes |
| `SVN: Update` | Update working copy |
| `SVN: Add` | Add file to version control |
| `SVN: Revert` | Revert local changes |
| `SVN: Delete` | Delete file from version control |
| `SVN: Switch Branch` | Switch to a different branch |
| `SVN: Create Branch` | Create a new branch |
| `SVN: Accept Theirs` | Resolve conflict using theirs |
| `SVN: Accept Mine` | Resolve conflict using mine |
| `SVN: Mark Resolved` | Mark conflict as resolved |
| `SVN: Refresh Log` | Refresh the SVN Log view |

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Package
npm run package
```

Press `F5` in VS Code to launch the Extension Development Host.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Inspired by [johnstoncode/svn-scm](https://github.com/JohnstonCode/svn-scm)
- Developed with significant assistance from [Claude](https://claude.ai) (Anthropic)

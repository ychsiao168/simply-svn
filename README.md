# Simply SVN

**SVN integration that feels like built-in Git**

Simply SVN brings native-feeling Subversion support to VS Code, with a familiar workflow that mirrors the built-in Git experience.

## Scope

This extension focuses on **everyday SVN operations** — the commands you use 90% of the time. It is not a full-featured SVN client and intentionally keeps a small feature set for simplicity and maintainability.

## Features

- 📁 **Source Control View** - See all your changes in the familiar SCM sidebar
- 🔄 **Quick Diff** - Gutter indicators showing what's changed
- ✅ **Core Operations** - Add, commit, revert, update, delete

## Requirements

- **SVN CLI** must be installed and available in your PATH
  - Windows: Install [SlikSVN](https://sliksvn.com/), or [TortoiseSVN](https://tortoisesvn.net/) with "command line client tools" enabled
  - macOS: `brew install svn`
  - Linux: `apt install subversion`

## Installation

1. Install from VS Code Marketplace (coming soon)
2. Or install from `.vsix` file

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
| `SVN: Commit` | Commit staged changes |
| `SVN: Update` | Update working copy |
| `SVN: Add` | Add file to version control |
| `SVN: Revert` | Revert local changes |
| `SVN: Delete` | Delete file from version control |

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

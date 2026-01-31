# Contributing to Simply SVN

Thank you for your interest in contributing! Here's how you can help.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/simply-svn.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development Workflow

```bash
# Start watch mode
npm run watch

# In VS Code, press F5 to launch Extension Development Host
```

## Code Style

- We use ESLint and Prettier
- Run `npm run lint:fix` before committing
- Run `npm run format` to format code

## Commit Messages

Use clear, descriptive commit messages:
- `feat: add branch switching support`
- `fix: resolve status refresh issue`
- `docs: update README`

## Pull Requests

1. Update documentation if needed
2. Ensure all tests pass
3. Keep changes focused and atomic
4. Reference any related issues

## Reporting Issues

When reporting bugs, please include:
- VS Code version
- Extension version
- SVN version (`svn --version`)
- Operating system
- Steps to reproduce

## Questions?

Feel free to open an issue for discussion!

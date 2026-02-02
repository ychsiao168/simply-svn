import * as vscode from 'vscode';
import * as path from 'path';
import { SvnExtension } from './svnExtension';
import { BlameEntry } from './svn/parser';

/**
 * Extract branch name from SVN URL using standard trunk/branches/tags layout.
 * Falls back to the relative path from repository root.
 */
function getBranchName(url: string, repositoryRoot: string): string {
    const relative = url.replace(repositoryRoot, '');
    // Standard layout: /trunk, /branches/xxx, /tags/xxx
    const trunkMatch = relative.match(/\/trunk(\/|$)/);
    if (trunkMatch) {
        return 'trunk';
    }
    const branchMatch = relative.match(/\/branches\/([^/]+)/);
    if (branchMatch) {
        return branchMatch[1];
    }
    const tagMatch = relative.match(/\/tags\/([^/]+)/);
    if (tagMatch) {
        return `tag: ${tagMatch[1]}`;
    }
    // No standard layout — return empty
    const stripped = relative.replace(/^\//, '');
    return stripped || '';
}

export class SvnStatusBar implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly extension: SvnExtension) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.name = 'Simply SVN';
        this.statusBarItem.command = 'simplySvn.switchBranch';

        this.disposables.push(
            this.statusBarItem,
            vscode.window.onDidChangeActiveTextEditor(() => this.update()),
        );
    }

    async update(): Promise<void> {
        const repo = this.extension.getActiveRepository();
        if (!repo) {
            this.statusBarItem.hide();
            return;
        }

        const info = await repo.getInfo();
        if (!info) {
            this.statusBarItem.hide();
            return;
        }

        const branch = getBranchName(info.url, info.repositoryRoot);
        this.statusBarItem.text = branch
            ? `$(source-control) SVN: ${branch} r${info.revision}`
            : `$(source-control) SVN r${info.revision}`;
        this.statusBarItem.tooltip = `${info.url}\nRevision: ${info.revision}`;
        this.statusBarItem.show();
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}

export class SvnBlameStatusBar implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];
    private blameCache: Map<string, BlameEntry[]> = new Map();
    private updateId = 0;

    constructor(private readonly extension: SvnExtension) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.name = 'SVN Blame';

        this.disposables.push(
            this.statusBarItem,
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.blameCache.clear();
                this.update();
            }),
            vscode.window.onDidChangeTextEditorSelection(e => {
                if (e.textEditor === vscode.window.activeTextEditor) {
                    this.update();
                }
            }),
            vscode.workspace.onDidSaveTextDocument(() => {
                this.blameCache.clear();
                this.update();
            }),
        );

        this.update();
    }

    async update(): Promise<void> {
        const currentId = ++this.updateId;

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.statusBarItem.hide();
            return;
        }

        const uri = editor.document.uri;
        if (uri.scheme !== 'file') {
            this.statusBarItem.hide();
            return;
        }

        const repo = this.extension.getRepositoryForFile(uri.fsPath);
        if (!repo) {
            this.statusBarItem.hide();
            return;
        }

        if (this.extension.fileHasNoHistory(uri.fsPath)) {
            this.statusBarItem.hide();
            return;
        }

        const fsPath = uri.fsPath;
        let entries = this.blameCache.get(fsPath);
        if (!entries) {
            const relativePath = path.relative(repo.root, fsPath);
            entries = await repo.getBlame(relativePath);
            if (this.updateId !== currentId) {
                return;
            }
            if (entries.length === 0) {
                this.statusBarItem.hide();
                return;
            }
            this.blameCache.set(fsPath, entries);
        }

        const line = editor.selection.active.line + 1; // 1-based
        const entry = entries.find(e => e.lineNumber === line && e.revision > 0);
        if (!entry) {
            this.statusBarItem.hide();
            return;
        }

        this.statusBarItem.text = `$(git-commit) ${entry.author}, r${entry.revision}`;

        const d = new Date(entry.date);
        const localDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        this.statusBarItem.tooltip = `r${entry.revision} by ${entry.author}\n${localDate}`;
        this.statusBarItem.show();
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}

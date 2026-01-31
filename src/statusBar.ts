import * as vscode from 'vscode';
import { SvnExtension } from './svnExtension';

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
        this.statusBarItem.command = 'simplySvn.showInfo';

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

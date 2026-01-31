import * as vscode from 'vscode';
import { SvnExtension } from '../svnExtension';
import { LogEntry, LogChangedPath } from '../svn/parser';

type LogTreeItem = LogItem | FileChangeItem;

class LogItem extends vscode.TreeItem {
    constructor(public readonly entry: LogEntry) {
        super(entry.message || '(no message)', vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `r${entry.revision} · ${entry.author}`;
        const d = new Date(entry.date);
        const localDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        this.tooltip = `r${entry.revision}\n${entry.author}\n${localDate}\n\n${entry.message}`;
        this.iconPath = new vscode.ThemeIcon('git-commit');
    }
}

const actionLabels: Record<string, string> = {
    A: 'Added',
    D: 'Deleted',
    M: 'Modified',
    R: 'Replaced',
};

const actionIcons: Record<string, string> = {
    A: 'diff-added',
    D: 'diff-removed',
    M: 'diff-modified',
    R: 'diff-renamed',
};

class FileChangeItem extends vscode.TreeItem {
    constructor(
        public readonly changedPath: LogChangedPath,
        public readonly revision: number,
        repoRoot: string
    ) {
        const fileName = changedPath.path.split('/').pop() || changedPath.path;
        super(fileName, vscode.TreeItemCollapsibleState.None);

        this.description = changedPath.path;
        this.tooltip = `${actionLabels[changedPath.action] || changedPath.action}: ${changedPath.path}`;
        this.iconPath = new vscode.ThemeIcon(actionIcons[changedPath.action] || 'file');

        // resourceUri with action in query, used by FileDecorationProvider for coloring
        this.resourceUri = vscode.Uri.parse(
            `svn-log:${changedPath.path}?action=${changedPath.action}`
        );

        if (changedPath.action !== 'D') {
            this.command = {
                command: 'simplySvn.diffRevision',
                title: 'Show Diff',
                arguments: [repoRoot, changedPath.path, revision],
            };
        }
    }
}

const actionColors: Record<string, vscode.ThemeColor> = {
    A: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
    D: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
    M: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
    R: new vscode.ThemeColor('gitDecoration.renamedResourceForeground'),
};

const actionBadges: Record<string, string> = {
    A: 'A',
    D: 'D',
    M: 'M',
    R: 'R',
};

export class SvnLogDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== 'svn-log') {
            return undefined;
        }
        const params = new URLSearchParams(uri.query);
        const action = params.get('action') || '';
        return {
            badge: actionBadges[action],
            color: actionColors[action],
            tooltip: actionLabels[action] || action,
        };
    }

    dispose(): void {
        this._onDidChangeFileDecorations.dispose();
    }
}

export class SvnLogTreeProvider implements vscode.TreeDataProvider<LogTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private logEntries: LogEntry[] = [];

    constructor(private readonly extension: SvnExtension) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: LogTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: LogTreeItem): Promise<LogTreeItem[]> {
        if (!element) {
            const repo = this.extension.getActiveRepository();
            if (!repo) {
                return [];
            }
            this.logEntries = await repo.getLog(undefined, 50);
            return this.logEntries.map(entry => new LogItem(entry));
        }

        if (element instanceof LogItem) {
            const repo = this.extension.getActiveRepository();
            const repoRoot = repo?.root || '';
            return element.entry.paths.map(
                p => new FileChangeItem(p, element.entry.revision, repoRoot)
            );
        }

        return [];
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}

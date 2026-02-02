import * as vscode from 'vscode';
import * as path from 'path';
import { SvnRepository } from '../svn/svnRepository';
import { StatusEntry, SvnFileStatus } from '../svn/parser';
import { SvnContentProvider } from './contentProvider';

const statusBadges: Record<string, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    conflicted: 'C',
    unversioned: '?',
    missing: '!',
    replaced: 'R',
};

const statusColors: Record<string, vscode.ThemeColor> = {
    modified: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
    added: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
    deleted: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
    conflicted: new vscode.ThemeColor('gitDecoration.conflictingResourceForeground'),
    unversioned: new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'),
    missing: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
    replaced: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
};

export class SvnScmDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri[]>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
    private decorations = new Map<string, vscode.FileDecoration>();

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== 'file') {
            return undefined;
        }
        return this.decorations.get(uri.fsPath.toLowerCase());
    }

    update(entries: { uri: vscode.Uri; status: SvnFileStatus }[]): void {
        const oldKeys = new Set(this.decorations.keys());
        this.decorations.clear();

        const changedUris: vscode.Uri[] = [];

        for (const { uri, status } of entries) {
            const key = uri.fsPath.toLowerCase();
            oldKeys.delete(key);
            this.decorations.set(key, {
                badge: statusBadges[status],
                color: statusColors[status],
                propagate: false,
            });
            changedUris.push(uri);
        }

        // Fire for removed entries too (use undefined to refresh all)
        this._onDidChangeFileDecorations.fire(changedUris);
    }

    dispose(): void {
        this._onDidChangeFileDecorations.dispose();
    }
}

export class SvnSourceControl implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private sourceControl: vscode.SourceControl;
    private changesGroup: vscode.SourceControlResourceGroup;
    private unversionedGroup: vscode.SourceControlResourceGroup;
    private conflictsGroup: vscode.SourceControlResourceGroup;
    private contentProvider: SvnContentProvider;
    private refreshTimeout: NodeJS.Timeout | undefined;

    constructor(
        private readonly repository: SvnRepository,
        private readonly outputChannel: vscode.OutputChannel,
        private readonly decorationProvider?: SvnScmDecorationProvider
    ) {
        // Create Source Control
        this.sourceControl = vscode.scm.createSourceControl(
            'svn',
            'SVN',
            vscode.Uri.file(repository.root)
        );
        this.sourceControl.acceptInputCommand = {
            command: 'simplySvn.commit',
            title: 'Commit',
        };
        this.sourceControl.inputBox.placeholder = 'Commit message (press ✓ to commit)';
        this.sourceControl.quickDiffProvider = this;

        // Create resource groups
        this.changesGroup = this.sourceControl.createResourceGroup('changes', 'Changes');
        this.unversionedGroup = this.sourceControl.createResourceGroup('unversioned', 'Unversioned');
        this.conflictsGroup = this.sourceControl.createResourceGroup('conflicts', 'Conflicts');

        // Configure group behavior
        this.changesGroup.hideWhenEmpty = true;
        this.unversionedGroup.hideWhenEmpty = true;
        this.conflictsGroup.hideWhenEmpty = true;

        // Content Provider for Quick Diff
        this.contentProvider = new SvnContentProvider(repository);
        this.disposables.push(
            vscode.workspace.registerTextDocumentContentProvider('svn', this.contentProvider)
        );

        // Watch for file changes
        this.setupFileWatcher();

        this.disposables.push(this.sourceControl);
    }

    private setupFileWatcher(): void {
        const config = vscode.workspace.getConfiguration('simplySvn');
        if (!config.get<boolean>('autoRefresh', true)) {
            return;
        }

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.repository.root, '**/*')
        );

        const scheduleRefresh = () => {
            if (this.refreshTimeout) {
                clearTimeout(this.refreshTimeout);
            }
            const interval = config.get<number>('refreshInterval', 3000);
            this.refreshTimeout = setTimeout(() => this.refresh(), interval);
        };

        watcher.onDidChange(scheduleRefresh);
        watcher.onDidCreate(scheduleRefresh);
        watcher.onDidDelete(scheduleRefresh);

        this.disposables.push(watcher);
    }

    /**
     * QuickDiffProvider implementation
     */
    provideOriginalResource(uri: vscode.Uri): vscode.Uri | undefined {
        if (uri.scheme !== 'file') {
            return undefined;
        }
        // Return svn: scheme URI for contentProvider to handle
        return uri.with({ scheme: 'svn', query: 'BASE' });
    }

    /**
     * Refresh status
     */
    async refresh(): Promise<void> {
        try {
            const statuses = await this.repository.getStatus();
            this.updateResourceGroups(statuses);
        } catch (error) {
            this.outputChannel.appendLine(`Refresh failed: ${error}`);
        }
    }

    private updateResourceGroups(statuses: StatusEntry[]): void {
        const changes: vscode.SourceControlResourceState[] = [];
        const unversioned: vscode.SourceControlResourceState[] = [];
        const conflicts: vscode.SourceControlResourceState[] = [];
        const decorationEntries: { uri: vscode.Uri; status: SvnFileStatus }[] = [];

        for (const entry of statuses) {
            const uri = vscode.Uri.file(path.join(this.repository.root, entry.path));
            const resourceState = this.createResourceState(uri, entry);
            decorationEntries.push({ uri, status: entry.status });

            switch (entry.status) {
                case 'conflicted':
                    conflicts.push(resourceState);
                    break;
                case 'unversioned':
                    unversioned.push(resourceState);
                    break;
                case 'added':
                case 'deleted':
                case 'modified':
                case 'replaced':
                case 'missing':
                    changes.push(resourceState);
                    break;
            }
        }

        this.changesGroup.resourceStates = changes;
        this.unversionedGroup.resourceStates = unversioned;
        this.conflictsGroup.resourceStates = conflicts;

        this.decorationProvider?.update(decorationEntries);
    }

    private createResourceState(
        uri: vscode.Uri,
        entry: StatusEntry
    ): vscode.SourceControlResourceState {
        const decorations = this.getDecorations(entry.status);

        return {
            resourceUri: uri,
            decorations,
            command: {
                command: 'simplySvn.openChange',
                title: 'Open Changes',
                arguments: [uri],
            },
        };
    }

    private getDecorations(status: SvnFileStatus): vscode.SourceControlResourceDecorations {
        switch (status) {
            case 'modified':
                return { tooltip: 'Modified' };
            case 'added':
                return { tooltip: 'Added' };
            case 'deleted':
                return { tooltip: 'Deleted', strikeThrough: true };
            case 'conflicted':
                return { tooltip: 'Conflicted' };
            case 'unversioned':
                return { tooltip: 'Unversioned' };
            case 'missing':
                return { tooltip: 'Missing', strikeThrough: true };
            default:
                return { tooltip: status };
        }
    }

    get inputBox(): vscode.SourceControlInputBox {
        return this.sourceControl.inputBox;
    }

    dispose(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.disposables.forEach(d => d.dispose());
    }
}

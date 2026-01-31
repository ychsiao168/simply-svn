import * as vscode from 'vscode';
import * as path from 'path';
import { SvnRepository } from '../svn/svnRepository';
import { StatusEntry, SvnFileStatus } from '../svn/parser';
import { SvnContentProvider } from './contentProvider';

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
        private readonly outputChannel: vscode.OutputChannel
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

        for (const entry of statuses) {
            const uri = vscode.Uri.file(path.join(this.repository.root, entry.path));
            const resourceState = this.createResourceState(uri, entry);

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
                return { iconPath: new vscode.ThemeIcon('diff-modified'), tooltip: 'Modified' };
            case 'added':
                return { iconPath: new vscode.ThemeIcon('diff-added'), tooltip: 'Added' };
            case 'deleted':
                return { iconPath: new vscode.ThemeIcon('diff-removed'), tooltip: 'Deleted' };
            case 'conflicted':
                return { iconPath: new vscode.ThemeIcon('warning'), tooltip: 'Conflicted' };
            case 'unversioned':
                return { iconPath: new vscode.ThemeIcon('question'), tooltip: 'Unversioned' };
            case 'missing':
                return { iconPath: new vscode.ThemeIcon('circle-slash'), tooltip: 'Missing' };
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

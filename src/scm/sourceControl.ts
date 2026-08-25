import * as vscode from 'vscode';
import * as path from 'path';
import { SvnRepository } from '../svn/svnRepository';
import { StatusEntry, SvnFileStatus, SvnPropStatus } from '../svn/parser';
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

    update(entries: { uri: vscode.Uri; status: SvnFileStatus; props?: SvnPropStatus }[]): void {
        const oldKeys = new Set(this.decorations.keys());
        this.decorations.clear();

        const changedUris: vscode.Uri[] = [];

        for (const { uri, status, props } of entries) {
            const key = uri.fsPath.toLowerCase();
            oldKeys.delete(key);
            // A conflicted property outranks the item status, matching how such an
            // entry is grouped under Conflicts. Otherwise a property-only change --
            // status 'normal', which carries no badge of its own -- borrows the
            // modified badge so it is not rendered blank.
            let badgeStatus = status;
            if (props === 'conflicted') {
                badgeStatus = 'conflicted';
            } else if (statusBadges[status] === undefined && props === 'modified') {
                badgeStatus = 'modified';
            }
            this.decorations.set(key, {
                badge: statusBadges[badgeStatus],
                color: statusColors[badgeStatus],
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
    private noHistoryFiles = new Set<string>();
    private statusReady = false;

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
        this.contentProvider = new SvnContentProvider(repository, (fsPath) => this.noHistoryFiles.has(fsPath.toLowerCase()));
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
        if (uri.scheme !== 'file' || !this.statusReady || this.noHistoryFiles.has(uri.fsPath.toLowerCase())) {
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

    hasNoHistory(fsPath: string): boolean {
        return this.noHistoryFiles.has(fsPath.toLowerCase());
    }

    private updateResourceGroups(statuses: StatusEntry[]): void {
        const changes: vscode.SourceControlResourceState[] = [];
        const unversioned: vscode.SourceControlResourceState[] = [];
        const conflicts: vscode.SourceControlResourceState[] = [];
        const decorationEntries: { uri: vscode.Uri; status: SvnFileStatus; props: SvnPropStatus }[] =
            [];
        const newNoHistory = new Set<string>();

        for (const entry of statuses) {
            const uri = vscode.Uri.file(path.join(this.repository.root, entry.path));
            const resourceState = this.createResourceState(uri, entry);
            decorationEntries.push({ uri, status: entry.status, props: entry.props });

            if (entry.status === 'added' || entry.status === 'unversioned') {
                newNoHistory.add(uri.fsPath.toLowerCase());
            }

            // A conflicted property is checked ahead of the item status: it can
            // accompany any status, and letting the status decide would put e.g.
            // {modified, props conflicted} into Changes, making an unresolved
            // conflict committable via getCommittablePaths().
            if (entry.props === 'conflicted') {
                conflicts.push(resourceState);
                continue;
            }

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
                default:
                    // A property-only change reports item="normal" with the real
                    // change in props. Without this the file never reaches a group,
                    // leaving it invisible in the SCM view and excluded from
                    // getCommittablePaths().
                    if (entry.props === 'modified') {
                        changes.push(resourceState);
                    }
                    break;
            }
        }

        this.noHistoryFiles = newNoHistory;
        this.statusReady = true;

        this.changesGroup.resourceStates = changes;
        this.unversionedGroup.resourceStates = unversioned;
        this.conflictsGroup.resourceStates = conflicts;

        this.decorationProvider?.update(decorationEntries);
    }

    private createResourceState(
        uri: vscode.Uri,
        entry: StatusEntry
    ): vscode.SourceControlResourceState {
        const decorations = this.getDecorations(entry.status, entry.props);

        return {
            resourceUri: uri,
            decorations,
            command: this.getPrimaryCommand(uri, entry),
        };
    }

    /**
     * The action taken when the resource row is clicked.
     *
     * A property-only change has item status 'normal' -- there is no text diff
     * behind it, and opening one fails outright rather than showing an empty
     * one. This also covers directories: a directory in the Changes group is
     * always there for a property change (content changes belong to the files
     * beneath it), and `svn cat` cannot fetch a directory at all. `svn status`
     * reports no node kind, so 'normal' is the only signal available.
     */
    private getPrimaryCommand(uri: vscode.Uri, entry: StatusEntry): vscode.Command {
        if (entry.status === 'unversioned') {
            return {
                command: 'simplySvn.openFile',
                title: 'Open File',
                arguments: [{ resourceUri: uri }],
            };
        }

        if (entry.status === 'normal') {
            return {
                command: 'simplySvn.showProperties',
                title: 'Show Properties',
                arguments: [uri],
            };
        }

        return {
            command: 'simplySvn.openChange',
            title: 'Open Changes',
            arguments: [uri],
        };
    }

    private getDecorations(
        status: SvnFileStatus,
        props: SvnPropStatus = 'none'
    ): vscode.SourceControlResourceDecorations {
        const propsSuffix =
            props === 'conflicted'
                ? ', properties conflicted'
                : props === 'modified'
                  ? ', properties modified'
                  : '';

        switch (status) {
            case 'modified':
                return { tooltip: `Modified${propsSuffix}` };
            case 'added':
                return { tooltip: `Added${propsSuffix}` };
            case 'deleted':
                return { tooltip: 'Deleted', strikeThrough: true };
            case 'conflicted':
                return { tooltip: 'Conflicted' };
            case 'unversioned':
                return { tooltip: 'Unversioned' };
            case 'missing':
                return { tooltip: 'Missing', strikeThrough: true };
            default:
                // Reached by property-only changes, whose item status is 'normal'.
                if (props === 'conflicted') {
                    return { tooltip: 'Properties conflicted' };
                }
                return { tooltip: props === 'modified' ? 'Properties modified' : status };
        }
    }

    get inputBox(): vscode.SourceControlInputBox {
        return this.sourceControl.inputBox;
    }

    /**
     * Paths of all committable resources (Changes group).
     * Used to explicitly scope `svn commit` so it doesn't pick up
     * unrelated scheduled changes (e.g. svn:mergeinfo on the working copy root).
     */
    getCommittablePaths(): string[] {
        return this.changesGroup.resourceStates.map(r => r.resourceUri.fsPath);
    }

    dispose(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.disposables.forEach(d => d.dispose());
    }
}

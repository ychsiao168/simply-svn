import * as vscode from 'vscode';
import { Svn } from './svn/svn';
import { SvnRepository } from './svn/svnRepository';
import { SvnSourceControl } from './scm/sourceControl';
import { registerCommands } from './commands';
import { SvnLogTreeProvider, SvnLogDecorationProvider } from './views/logTreeProvider';
import { SvnStatusBar, SvnBlameStatusBar } from './statusBar';

export class SvnExtension implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private svn: Svn | undefined;
    private repositories: Map<string, SvnRepository> = new Map();
    private sourceControls: Map<string, SvnSourceControl> = new Map();
    private statusBar: SvnStatusBar | undefined;
    private logTreeProvider: SvnLogTreeProvider | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel
    ) {}

    async initialize(): Promise<void> {
        // Check settings
        const config = vscode.workspace.getConfiguration('simplySvn');
        if (!config.get<boolean>('enabled', true)) {
            this.outputChannel.appendLine('Simply SVN is disabled in settings');
            return;
        }

        // Register commands once (they delegate to getActiveRepository which handles no-svn gracefully)
        registerCommands(this.context, this);

        // Register SVN Log TreeView
        this.logTreeProvider = new SvnLogTreeProvider(this);
        const logTreeView = vscode.window.createTreeView('simplySvn.log', {
            treeDataProvider: this.logTreeProvider,
        });
        const logDecorationProvider = new SvnLogDecorationProvider();
        this.disposables.push(
            logTreeView,
            this.logTreeProvider,
            vscode.window.registerFileDecorationProvider(logDecorationProvider),
            logDecorationProvider
        );

        // Status Bar
        this.statusBar = new SvnStatusBar(this);
        const blameStatusBar = new SvnBlameStatusBar(this);
        this.disposables.push(this.statusBar, blameStatusBar);

        // Watch for workspace folder changes
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.scanWorkspace())
        );

        // Re-initialize SVN when settings change
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('simplySvn.path') || e.affectsConfiguration('simplySvn.enabled')) {
                    this.initializeSvn();
                }
            })
        );

        // Initial SVN setup
        await this.initializeSvn();
    }

    private async initializeSvn(): Promise<void> {
        const config = vscode.workspace.getConfiguration('simplySvn');
        if (!config.get<boolean>('enabled', true)) {
            this.svn = undefined;
            return;
        }

        const svnPath = config.get<string>('path', 'svn');
        this.svn = new Svn(svnPath, this.outputChannel);

        const version = await this.svn.getVersion();
        if (!version) {
            this.svn = undefined;
            this.outputChannel.appendLine('SVN not found');
            const action = await vscode.window.showWarningMessage(
                'SVN not found. Please install SVN and ensure it is in your PATH, ' +
                'or configure the path in settings (simplySvn.path).',
                'Open Settings'
            );
            if (action === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'simplySvn.path');
            }
            return;
        }
        this.outputChannel.appendLine(`Found SVN version: ${version}`);

        await this.scanWorkspace();
    }

    private async scanWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || !this.svn) {
            return;
        }

        for (const folder of workspaceFolders) {
            await this.tryOpenRepository(folder.uri.fsPath);
        }
    }

    private async tryOpenRepository(path: string): Promise<void> {
        if (!this.svn || this.repositories.has(path)) {
            return;
        }

        const isSvnRepo = await this.svn.isSvnRepository(path);
        if (!isSvnRepo) {
            return;
        }

        this.outputChannel.appendLine(`Found SVN repository: ${path}`);
        vscode.commands.executeCommand('setContext', 'simplySvn.hasRepository', true);

        const repository = new SvnRepository(this.svn, path, this.outputChannel);
        this.repositories.set(path, repository);

        const sourceControl = new SvnSourceControl(repository, this.outputChannel);
        this.sourceControls.set(path, sourceControl);

        this.disposables.push(repository, sourceControl);

        // Initial refresh
        await sourceControl.refresh();
        await this.statusBar?.update();
    }

    get svnInstance(): Svn | undefined {
        return this.svn;
    }

    getRepository(path: string): SvnRepository | undefined {
        return this.repositories.get(path);
    }

    getActiveRepository(): SvnRepository | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return this.repositories.values().next().value;
        }

        const filePath = editor.document.uri.fsPath;
        for (const [repoPath, repo] of this.repositories) {
            if (filePath.startsWith(repoPath)) {
                return repo;
            }
        }

        return this.repositories.values().next().value;
    }

    getRepositoryForFile(filePath: string): SvnRepository | undefined {
        for (const [repoPath, repo] of this.repositories) {
            if (filePath.toLowerCase().startsWith(repoPath.toLowerCase())) {
                return repo;
            }
        }
        return undefined;
    }

    getSourceControl(path: string): SvnSourceControl | undefined {
        return this.sourceControls.get(path);
    }

    async refreshAll(): Promise<void> {
        for (const sourceControl of this.sourceControls.values()) {
            await sourceControl.refresh();
        }
        await this.statusBar?.update();
        this.logTreeProvider?.refresh();
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.repositories.clear();
        this.sourceControls.clear();
    }
}

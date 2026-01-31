import * as vscode from 'vscode';
import { Svn } from './svn/svn';
import { SvnRepository } from './svn/svnRepository';
import { SvnSourceControl } from './scm/sourceControl';
import { registerCommands } from './commands';
import { SvnLogTreeProvider, SvnLogDecorationProvider } from './views/logTreeProvider';

export class SvnExtension implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private svn: Svn | undefined;
    private repositories: Map<string, SvnRepository> = new Map();
    private sourceControls: Map<string, SvnSourceControl> = new Map();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly outputChannel: vscode.OutputChannel
    ) {}

    async initialize(): Promise<void> {
        // 檢查設定
        const config = vscode.workspace.getConfiguration('simplySvn');
        if (!config.get<boolean>('enabled', true)) {
            this.outputChannel.appendLine('Simply SVN is disabled in settings');
            return;
        }

        // 初始化 SVN CLI wrapper
        const svnPath = config.get<string>('path', 'svn');
        this.svn = new Svn(svnPath, this.outputChannel);

        // 檢查 SVN 是否可用
        const version = await this.svn.getVersion();
        if (!version) {
            throw new Error(
                'SVN not found. Please install SVN and ensure it is in your PATH, ' +
                'or set the path in settings (simplySvn.path)'
            );
        }
        this.outputChannel.appendLine(`Found SVN version: ${version}`);

        // 註冊命令
        registerCommands(this.context, this);

        // 掃描 workspace 中的 SVN repositories
        await this.scanWorkspace();

        // Register SVN Log TreeView
        const logTreeProvider = new SvnLogTreeProvider(this);
        const logTreeView = vscode.window.createTreeView('simplySvn.log', {
            treeDataProvider: logTreeProvider,
        });
        const logDecorationProvider = new SvnLogDecorationProvider();
        this.disposables.push(
            logTreeView,
            logTreeProvider,
            vscode.window.registerFileDecorationProvider(logDecorationProvider),
            logDecorationProvider
        );

        // 監聽 workspace 變化
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.scanWorkspace())
        );
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

        // 初始刷新
        await sourceControl.refresh();
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
            if (filePath.startsWith(repoPath)) {
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
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.repositories.clear();
        this.sourceControls.clear();
    }
}

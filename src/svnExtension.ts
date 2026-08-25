import * as vscode from 'vscode';
import * as path from 'path';
import { Svn } from './svn/svn';
import { SvnRepository } from './svn/svnRepository';
import { SvnSourceControl, SvnScmDecorationProvider } from './scm/sourceControl';
import { registerCommands } from './commands';
import { SvnLogTreeProvider, SvnLogDecorationProvider } from './views/logTreeProvider';
import { SvnStatusBar, SvnBlameStatusBar } from './statusBar';
import { SvnPropertyContentProvider, SVN_PROPS_SCHEME } from './scm/contentProvider';

/**
 * Platform approximation of filesystem case sensitivity. Folding everywhere
 * would make /work/Repo and /work/repo -- distinct directories on Linux --
 * claim each other's files.
 *
 * Only the platform is consulted, so this is wrong at the edges in both
 * directions: macOS defaults to case-insensitive but APFS and HFS+ can be
 * formatted otherwise, and a Windows host can reach case-sensitive storage
 * over a UNC share, \\wsl$, or a directory with case sensitivity enabled.
 * Getting those right needs per-volume probing. The cost of being wrong is
 * bounded -- a missed match, or a conflated one only among roots whose paths
 * differ solely by case -- so the approximation is deliberate.
 */
const pathsAreCaseInsensitive = process.platform === 'win32';

function normalizePath(p: string): string {
    const resolved = path.resolve(p);
    return pathsAreCaseInsensitive ? resolved.toLowerCase() : resolved;
}

/**
 * Whether `filePath` is `root` itself or sits beneath it.
 *
 * A plain prefix test matches partial path segments, so a file in
 * `/work/repo-other` would be attributed to a working copy at `/work/repo`.
 */
function isWithin(root: string, filePath: string): boolean {
    const normalizedRoot = normalizePath(root);
    const normalizedFile = normalizePath(filePath);

    if (normalizedFile === normalizedRoot) {
        return true;
    }
    const withSeparator = normalizedRoot.endsWith(path.sep)
        ? normalizedRoot
        : normalizedRoot + path.sep;
    return normalizedFile.startsWith(withSeparator);
}

export class SvnExtension implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private svn: Svn | undefined;
    private repositories: Map<string, SvnRepository> = new Map();
    private sourceControls: Map<string, SvnSourceControl> = new Map();
    private statusBar: SvnStatusBar | undefined;
    private blameStatusBar: SvnBlameStatusBar | undefined;
    private logTreeProvider: SvnLogTreeProvider | undefined;
    private scmDecorationProvider: SvnScmDecorationProvider | undefined;
    private propertyContentProvider: SvnPropertyContentProvider | undefined;

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
        this.scmDecorationProvider = new SvnScmDecorationProvider();
        this.disposables.push(
            logTreeView,
            this.logTreeProvider,
            vscode.window.registerFileDecorationProvider(logDecorationProvider),
            vscode.window.registerFileDecorationProvider(this.scmDecorationProvider),
            logDecorationProvider,
            this.scmDecorationProvider
        );

        // Property viewer: one provider for every working copy, since the
        // command is reachable from the Explorer for any of them.
        this.propertyContentProvider = new SvnPropertyContentProvider(fsPath =>
            this.getRepositoryForFile(fsPath)
        );
        this.disposables.push(
            vscode.workspace.registerTextDocumentContentProvider(
                SVN_PROPS_SCHEME,
                this.propertyContentProvider
            )
        );

        // Status Bar
        this.statusBar = new SvnStatusBar(this);
        this.blameStatusBar = new SvnBlameStatusBar(this);
        this.disposables.push(this.statusBar, this.blameStatusBar);

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

        const sourceControl = new SvnSourceControl(repository, this.outputChannel, this.scmDecorationProvider);
        this.sourceControls.set(path, sourceControl);

        this.disposables.push(repository, sourceControl);

        // Initial refresh
        await sourceControl.refresh();
        await this.statusBar?.update();
        await this.blameStatusBar?.update();
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

        return (
            this.getRepositoryForFile(editor.document.uri.fsPath) ??
            this.repositories.values().next().value
        );
    }

    getRepositoryForFile(filePath: string): SvnRepository | undefined {
        let best: SvnRepository | undefined;
        let bestLength = -1;

        for (const [repoPath, repo] of this.repositories) {
            if (!isWithin(repoPath, filePath)) {
                continue;
            }
            // Nested working copies: the deepest root that contains the file is
            // the one that owns it. Measured after normalization so depth
            // reflects the resolved path, not however the root was spelled.
            const depth = normalizePath(repoPath).length;
            if (depth > bestLength) {
                best = repo;
                bestLength = depth;
            }
        }

        return best;
    }

    fileHasNoHistory(fsPath: string): boolean {
        for (const [, sc] of this.sourceControls) {
            if (sc.hasNoHistory(fsPath)) {
                return true;
            }
        }
        return false;
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

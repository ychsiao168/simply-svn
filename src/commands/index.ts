import * as vscode from 'vscode';
import * as path from 'path';
import { SvnExtension } from '../svnExtension';

export function registerCommands(
    context: vscode.ExtensionContext,
    extension: SvnExtension
): void {
    // Refresh
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.refresh', async () => {
            await extension.refreshAll();
        })
    );

    // Commit
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.commit', async () => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                vscode.window.showWarningMessage('No SVN repository found');
                return;
            }

            // Get the commit message from Source Control input box
            const sourceControl = extension.getSourceControl(repo.root);
            const message = sourceControl?.inputBox.value;

            if (!message || message.trim() === '') {
                vscode.window.showWarningMessage('Please enter a commit message');
                return;
            }

            const success = await repo.commit(message);
            if (success) {
                if (sourceControl) {
                    sourceControl.inputBox.value = '';
                }
                vscode.window.showInformationMessage('Committed successfully.');
            } else {
                vscode.window.showErrorMessage('Commit failed. Check the Simply SVN output for details.');
            }
            await extension.refreshAll();
        })
    );

    // Update
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.update', async () => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                vscode.window.showWarningMessage('No SVN repository found');
                return;
            }

            await repo.update();
            await extension.refreshAll();
        })
    );

    // Add
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.add', async (resource?: vscode.SourceControlResourceState) => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                return;
            }

            const paths = resource 
                ? [resource.resourceUri.fsPath]
                : await getSelectedResources();

            if (paths.length > 0) {
                await repo.add(paths);
                await extension.refreshAll();
            }
        })
    );

    // Revert
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.revert', async (resource?: vscode.SourceControlResourceState) => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                return;
            }

            const paths = resource 
                ? [resource.resourceUri.fsPath]
                : await getSelectedResources();

            if (paths.length === 0) {
                return;
            }

            // Confirmation dialog
            const confirm = await vscode.window.showWarningMessage(
                `Revert ${paths.length} file(s)? This will discard all local changes.`,
                { modal: true },
                'Revert'
            );

            if (confirm === 'Revert') {
                await repo.revert(paths);
                await extension.refreshAll();
            }
        })
    );

    // Delete
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.delete', async (resource?: vscode.SourceControlResourceState) => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                return;
            }

            const paths = resource 
                ? [resource.resourceUri.fsPath]
                : await getSelectedResources();

            if (paths.length === 0) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Delete ${paths.length} file(s) from SVN?`,
                { modal: true },
                'Delete'
            );

            if (confirm === 'Delete') {
                const success = await repo.delete(paths);
                if (!success) {
                    vscode.window.showErrorMessage('Failed to delete. Files may have local modifications — commit or revert them first.');
                }
                await extension.refreshAll();
            }
        })
    );

    // Open File
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.openFile', async (resource?: vscode.SourceControlResourceState | vscode.Uri) => {
            let uri: vscode.Uri | undefined;

            if (resource instanceof vscode.Uri) {
                uri = resource;
            } else if (resource?.resourceUri) {
                uri = resource.resourceUri;
            }

            if (uri) {
                await vscode.window.showTextDocument(uri);
            }
        })
    );

    // Open Change (Diff)
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.openChange', async (resource?: vscode.SourceControlResourceState | vscode.Uri) => {
            let uri: vscode.Uri | undefined;

            if (resource instanceof vscode.Uri) {
                uri = resource;
            } else if (resource?.resourceUri) {
                uri = resource.resourceUri;
            }

            if (!uri) {
                return;
            }

            const baseUri = uri.with({ scheme: 'svn', query: 'BASE' });
            const repo = extension.getRepositoryForFile(uri.fsPath);
            const relativePath = repo ? path.relative(repo.root, uri.fsPath) : path.basename(uri.fsPath);
            const title = `${relativePath} (Working Tree)`;

            await vscode.commands.executeCommand('vscode.diff', baseUri, uri, title);
        })
    );

    // Diff Revision (from SVN Log)
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.diffRevision', async (repoRoot: string, svnPath: string, revision: number) => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                return;
            }

            // SVN log paths are repo-relative (e.g., /trunk/file.txt or /file.txt)
            // For simple repos without trunk, strip the leading slash
            const info = await repo.getInfo();
            let relativePath = svnPath;
            if (info) {
                const repoUrl = info.url;
                const rootUrl = info.repositoryRoot;
                const wcSubpath = repoUrl.replace(rootUrl, '');
                if (wcSubpath && relativePath.startsWith(wcSubpath)) {
                    relativePath = relativePath.substring(wcSubpath.length);
                }
            }
            if (relativePath.startsWith('/')) {
                relativePath = relativePath.substring(1);
            }

            const prevRev = (revision - 1).toString();
            const curRev = revision.toString();

            const leftUri = vscode.Uri.file(
                path.join(repoRoot, relativePath)
            ).with({ scheme: 'svn', query: prevRev });

            const rightUri = vscode.Uri.file(
                path.join(repoRoot, relativePath)
            ).with({ scheme: 'svn', query: curRev });

            const fileName = relativePath.split('/').pop() || relativePath;
            const title = `${fileName} (r${prevRev} → r${curRev})`;

            await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
        })
    );

    // Switch Branch
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.switchBranch', async () => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                vscode.window.showWarningMessage('No SVN repository found');
                return;
            }

            const info = await repo.getInfo();
            if (!info) {
                vscode.window.showWarningMessage('Failed to get SVN info');
                return;
            }

            const branches = await repo.listBranches();

            type BranchQuickPickItem = vscode.QuickPickItem & { url?: string };
            const items: BranchQuickPickItem[] = [];

            // Add trunk
            items.push({
                label: 'trunk',
                description: `${info.repositoryRoot}/trunk`,
                url: `${info.repositoryRoot}/trunk`,
            });

            // Add branches
            for (const branch of branches) {
                items.push({
                    label: branch,
                    description: `${info.repositoryRoot}/branches/${branch}`,
                    url: `${info.repositoryRoot}/branches/${branch}`,
                });
            }

            // Separator + create new branch
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
            items.push({
                label: '$(add) Create new branch...',
            });

            const selected = await vscode.window.showQuickPick(items, {
                title: 'Switch Branch',
                placeHolder: 'Select a branch to switch to',
            });

            if (!selected) {
                return;
            }

            if (!selected.url) {
                // Create new branch
                await vscode.commands.executeCommand('simplySvn.createBranch');
                return;
            }

            // Check if already on this branch
            if (info.url === selected.url) {
                vscode.window.showInformationMessage(`Already on ${selected.label}`);
                return;
            }

            const success = await repo.switchBranch(selected.url);
            if (success) {
                await extension.refreshAll();
            }
        })
    );

    // Create Branch
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.createBranch', async () => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                vscode.window.showWarningMessage('No SVN repository found');
                return;
            }

            const branchName = await vscode.window.showInputBox({
                title: 'Create Branch',
                prompt: 'Enter the new branch name',
                placeHolder: 'feature-xxx',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'Branch name cannot be empty';
                    }
                    if (/[^a-zA-Z0-9._-]/.test(value)) {
                        return 'Branch name can only contain letters, numbers, dots, hyphens, and underscores';
                    }
                    return undefined;
                },
            });

            if (!branchName) {
                return;
            }

            const success = await repo.createBranch(branchName);
            if (!success) {
                return;
            }

            // Ask if user wants to switch to the new branch
            const switchTo = await vscode.window.showInformationMessage(
                `Branch "${branchName}" created. Switch to it?`,
                'Switch',
                'Stay'
            );

            if (switchTo === 'Switch') {
                const info = await repo.getInfo();
                if (info) {
                    const url = `${info.repositoryRoot}/branches/${branchName}`;
                    await repo.switchBranch(url);
                    await extension.refreshAll();
                }
            }
        })
    );

    // Resolve: Accept Theirs
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.resolveTheirs', async (resource?: vscode.SourceControlResourceState) => {
            const repo = extension.getActiveRepository();
            if (!repo || !resource) {
                return;
            }
            const success = await repo.resolve(resource.resourceUri.fsPath, 'theirs-full');
            if (success) {
                await extension.refreshAll();
            } else {
                vscode.window.showErrorMessage('Failed to resolve conflict.');
            }
        })
    );

    // Resolve: Accept Mine
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.resolveMine', async (resource?: vscode.SourceControlResourceState) => {
            const repo = extension.getActiveRepository();
            if (!repo || !resource) {
                return;
            }
            const success = await repo.resolve(resource.resourceUri.fsPath, 'mine-full');
            if (success) {
                await extension.refreshAll();
            } else {
                vscode.window.showErrorMessage('Failed to resolve conflict.');
            }
        })
    );

    // Resolve: Mark as Resolved (use working copy as-is)
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.resolveWorking', async (resource?: vscode.SourceControlResourceState) => {
            const repo = extension.getActiveRepository();
            if (!repo || !resource) {
                return;
            }
            const success = await repo.resolve(resource.resourceUri.fsPath, 'working');
            if (success) {
                await extension.refreshAll();
            } else {
                vscode.window.showErrorMessage('Failed to resolve conflict.');
            }
        })
    );

    // Refresh Log
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.refreshLog', async () => {
            await extension.refreshAll();
        })
    );

    // Show SVN Info
    context.subscriptions.push(
        vscode.commands.registerCommand('simplySvn.showInfo', async () => {
            const repo = extension.getActiveRepository();
            if (!repo) {
                vscode.window.showWarningMessage('No SVN repository found');
                return;
            }

            const info = await repo.getInfo();
            if (!info) {
                vscode.window.showWarningMessage('Failed to get SVN info');
                return;
            }

            const items = [
                `URL: ${info.url}`,
                `Repository Root: ${info.repositoryRoot}`,
                `Revision: ${info.revision}`,
                info.lastChangedAuthor ? `Last Author: ${info.lastChangedAuthor}` : '',
                info.lastChangedRev ? `Last Changed Rev: ${info.lastChangedRev}` : '',
                info.lastChangedDate ? `Last Changed Date: ${formatLocalDate(info.lastChangedDate)}` : '',
            ].filter(Boolean);

            vscode.window.showQuickPick(items, { title: 'SVN Info', canPickMany: false });
        })
    );
}

function formatLocalDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/**
 * Get currently selected resources (for multi-select operations)
 */
async function getSelectedResources(): Promise<string[]> {
    // Simplified version — may need to track SCM selection state for full multi-select
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        return [editor.document.uri.fsPath];
    }
    return [];
}

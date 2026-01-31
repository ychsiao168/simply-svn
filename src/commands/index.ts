import * as vscode from 'vscode';
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

            // 取得 Source Control 的輸入訊息
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

            // 確認對話框
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
            const title = `${uri.fsPath} (Working vs BASE)`;

            await vscode.commands.executeCommand('vscode.diff', baseUri, uri, title);
        })
    );
}

/**
 * 取得目前選取的資源（用於多選操作）
 */
async function getSelectedResources(): Promise<string[]> {
    // 這是簡化版，實際上可能需要追蹤 SCM 選取狀態
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        return [editor.document.uri.fsPath];
    }
    return [];
}

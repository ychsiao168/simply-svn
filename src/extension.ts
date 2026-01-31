import * as vscode from 'vscode';
import { SvnExtension } from './svnExtension';

let extension: SvnExtension | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('Simply SVN');
    outputChannel.appendLine('Simply SVN is starting...');

    try {
        extension = new SvnExtension(context, outputChannel);
        await extension.initialize();
        outputChannel.appendLine('Simply SVN activated successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to activate: ${message}`);
        vscode.window.showErrorMessage(`Simply SVN: ${message}`);
    }
}

export function deactivate(): void {
    extension?.dispose();
}

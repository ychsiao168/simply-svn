import * as vscode from 'vscode';
import * as path from 'path';
import { SvnRepository } from '../svn/svnRepository';

/**
 * Provides SVN file content for Quick Diff
 */
export class SvnContentProvider implements vscode.TextDocumentContentProvider {
    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(
        private readonly repository: SvnRepository,
        private readonly shouldSkip?: (fsPath: string) => boolean
    ) {}

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        if (this.shouldSkip?.(uri.fsPath)) {
            return '';
        }

        // uri.query contains the revision, e.g. "BASE"
        const revision = uri.query || 'BASE';

        // Get relative path
        const relativePath = path.relative(
            this.repository.root,
            uri.fsPath
        );

        try {
            const content = await this.repository.getContentAtRevision(relativePath, revision);
            return content || '';
        } catch (error) {
            console.error(`Failed to get content for ${uri.fsPath}:`, error);
            return '';
        }
    }

    /**
     * Notify VS Code that content has changed
     */
    fireChange(uri: vscode.Uri): void {
        this.onDidChangeEmitter.fire(uri);
    }
}

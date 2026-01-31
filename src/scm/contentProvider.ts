import * as vscode from 'vscode';
import * as path from 'path';
import { SvnRepository } from '../svn/svnRepository';

/**
 * 提供 SVN 檔案內容（用於 Quick Diff）
 */
export class SvnContentProvider implements vscode.TextDocumentContentProvider {
    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(private readonly repository: SvnRepository) {}

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        // uri.query 包含版本資訊，例如 "BASE"
        const revision = uri.query || 'BASE';
        
        // 取得相對路徑
        const relativePath = path.relative(
            this.repository.root,
            uri.fsPath
        );

        try {
            const content = await this.repository.getBaseContent(relativePath);
            return content || '';
        } catch (error) {
            console.error(`Failed to get content for ${uri.fsPath}:`, error);
            return '';
        }
    }

    /**
     * 通知 VS Code 內容已變更
     */
    fireChange(uri: vscode.Uri): void {
        this.onDidChangeEmitter.fire(uri);
    }
}

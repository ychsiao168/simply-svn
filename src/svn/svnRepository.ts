import * as vscode from 'vscode';
import { Svn } from './svn';
import { BlameEntry, LogEntry, StatusEntry, SvnInfo, SvnLogParser } from './parser';

export class SvnRepository implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private _info: SvnInfo | undefined;

    constructor(
        private readonly svn: Svn,
        public readonly root: string,
        private readonly outputChannel: vscode.OutputChannel
    ) {}

    get info(): SvnInfo | undefined {
        return this._info;
    }

    /**
     * 取得 repository 資訊
     */
    async getInfo(): Promise<SvnInfo | undefined> {
        this._info = await this.svn.info(this.root);
        return this._info;
    }

    /**
     * 取得狀態
     */
    async getStatus(): Promise<StatusEntry[]> {
        return this.svn.status(this.root);
    }

    /**
     * Add 檔案
     */
    async add(paths: string[]): Promise<boolean> {
        const result = await this.svn.add(paths, this.root);
        return result.exitCode === 0;
    }

    /**
     * Revert 檔案
     */
    async revert(paths: string[]): Promise<boolean> {
        const result = await this.svn.revert(paths, this.root);
        return result.exitCode === 0;
    }

    /**
     * Delete 檔案
     */
    async delete(paths: string[]): Promise<boolean> {
        const result = await this.svn.delete(paths, this.root);
        return result.exitCode === 0;
    }

    /**
     * Commit
     */
    async commit(message: string, paths?: string[]): Promise<boolean> {
        const result = await this.svn.commit(message, paths || [], this.root);
        if (result.exitCode === 0) {
            vscode.window.showInformationMessage('SVN: Commit successful');
            return true;
        } else {
            vscode.window.showErrorMessage(`SVN Commit failed: ${result.stderr}`);
            return false;
        }
    }

    /**
     * Update
     */
    async update(revision?: string): Promise<boolean> {
        const result = await this.svn.update(this.root, revision);
        if (result.exitCode === 0) {
            vscode.window.showInformationMessage('SVN: Update successful');
            return true;
        } else {
            vscode.window.showErrorMessage(`SVN Update failed: ${result.stderr}`);
            return false;
        }
    }

    /**
     * 取得 BASE 版本的檔案內容（用於 diff）
     */
    async getBaseContent(relativePath: string): Promise<string | undefined> {
        return this.svn.cat(relativePath, 'BASE', this.root);
    }

    async getContentAtRevision(relativePath: string, revision: string): Promise<string | undefined> {
        return this.svn.cat(relativePath, revision, this.root);
    }

    /**
     * 取得 diff
     */
    async diff(path: string): Promise<string> {
        return this.svn.diff(path, this.root);
    }

    async getBlame(relativePath: string): Promise<BlameEntry[]> {
        return this.svn.blame(relativePath, this.root);
    }

    async getLog(filePath?: string, limit?: number): Promise<LogEntry[]> {
        const result = await this.svn.log(this.root, filePath, limit);
        if (result.exitCode !== 0) {
            return [];
        }
        return SvnLogParser.parse(result.stdout);
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}

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

    /**
     * List branches from the standard layout (repoRoot/branches/).
     * Returns branch names, or empty array if not using standard layout.
     */
    async listBranches(): Promise<string[]> {
        const info = await this.getInfo();
        if (!info) {
            return [];
        }
        return this.svn.ls(`${info.repositoryRoot}/branches`);
    }

    /**
     * Switch working copy to a different branch URL.
     */
    async switchBranch(url: string): Promise<boolean> {
        const result = await this.svn.switch(url, this.root);
        if (result.exitCode === 0) {
            vscode.window.showInformationMessage(`SVN: Switched to ${url}`);
            return true;
        } else {
            vscode.window.showErrorMessage(`SVN Switch failed: ${result.stderr}`);
            return false;
        }
    }

    /**
     * Create a branch via server-side copy from current URL.
     */
    async createBranch(branchName: string): Promise<boolean> {
        const info = await this.getInfo();
        if (!info) {
            return false;
        }
        const destUrl = `${info.repositoryRoot}/branches/${branchName}`;
        const result = await this.svn.copy(info.url, destUrl, `Create branch ${branchName}`);
        if (result.exitCode === 0) {
            vscode.window.showInformationMessage(`SVN: Created branch ${branchName}`);
            return true;
        } else {
            vscode.window.showErrorMessage(`SVN Create branch failed: ${result.stderr}`);
            return false;
        }
    }

    /**
     * Resolve a conflicted file.
     */
    async resolve(filePath: string, accept: 'working' | 'mine-full' | 'theirs-full'): Promise<boolean> {
        const result = await this.svn.resolve(filePath, accept, this.root);
        return result.exitCode === 0;
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

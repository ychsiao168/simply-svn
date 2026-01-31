import * as cp from 'child_process';
import * as vscode from 'vscode';
import { SvnStatusParser, SvnInfoParser, SvnBlameParser, StatusEntry, SvnInfo, BlameEntry } from './parser';

export interface SvnExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export class Svn {
    constructor(
        private readonly svnPath: string,
        private readonly outputChannel: vscode.OutputChannel
    ) {}

    /**
     * 執行 SVN 命令
     */
    async exec(args: string[], cwd?: string): Promise<SvnExecResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            this.outputChannel.appendLine(`> svn ${args.join(' ')}`);

            const child = cp.spawn(this.svnPath, args, {
                cwd,
                env: { ...process.env, LC_ALL: 'C' },
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data: Buffer) => {
                stdout += data.toString('utf8');
            });

            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString('utf8');
            });

            child.on('close', (exitCode: number | null) => {
                const duration = Date.now() - startTime;
                this.outputChannel.appendLine(`  completed in ${duration}ms (exit: ${exitCode})`);
                
                if (stderr) {
                    this.outputChannel.appendLine(`  stderr: ${stderr.trim()}`);
                }

                resolve({
                    exitCode: exitCode ?? 1,
                    stdout,
                    stderr,
                });
            });

            child.on('error', (err: Error) => {
                this.outputChannel.appendLine(`  error: ${err.message}`);
                resolve({
                    exitCode: 1,
                    stdout: '',
                    stderr: err.message,
                });
            });
        });
    }

    /**
     * 取得 SVN 版本
     */
    async getVersion(): Promise<string | undefined> {
        const result = await this.exec(['--version', '--quiet']);
        if (result.exitCode === 0) {
            return result.stdout.trim();
        }
        return undefined;
    }

    /**
     * 檢查目錄是否為 SVN repository
     */
    async isSvnRepository(path: string): Promise<boolean> {
        const result = await this.exec(['info', '--xml'], path);
        return result.exitCode === 0;
    }

    /**
     * 取得 repository 資訊
     */
    async info(path: string): Promise<SvnInfo | undefined> {
        const result = await this.exec(['info', '--xml'], path);
        if (result.exitCode !== 0) {
            return undefined;
        }
        return SvnInfoParser.parse(result.stdout);
    }

    /**
     * 取得狀態
     */
    async status(path: string): Promise<StatusEntry[]> {
        const result = await this.exec(['status', '--xml'], path);
        if (result.exitCode !== 0) {
            return [];
        }
        return SvnStatusParser.parse(result.stdout);
    }

    /**
     * Add 檔案
     */
    async add(paths: string[], cwd: string): Promise<SvnExecResult> {
        return this.exec(['add', ...paths], cwd);
    }

    /**
     * Revert 檔案
     */
    async revert(paths: string[], cwd: string): Promise<SvnExecResult> {
        return this.exec(['revert', ...paths], cwd);
    }

    /**
     * Delete 檔案
     */
    async delete(paths: string[], cwd: string): Promise<SvnExecResult> {
        return this.exec(['delete', '--force', ...paths], cwd);
    }

    /**
     * Commit
     */
    async commit(message: string, paths: string[], cwd: string): Promise<SvnExecResult> {
        const args = ['commit', '-m', message];
        if (paths.length > 0) {
            args.push(...paths);
        }
        return this.exec(args, cwd);
    }

    /**
     * Update
     */
    async update(path: string, revision?: string): Promise<SvnExecResult> {
        const args = ['update'];
        if (revision) {
            args.push('-r', revision);
        }
        return this.exec(args, path);
    }

    /**
     * 取得檔案內容（特定版本）
     */
    async cat(filePath: string, revision: string, cwd: string): Promise<string | undefined> {
        const result = await this.exec(['cat', '-r', revision, filePath], cwd);
        if (result.exitCode === 0) {
            return result.stdout;
        }
        return undefined;
    }

    /**
     * Diff
     */
    async diff(path: string, cwd: string): Promise<string> {
        const result = await this.exec(['diff', path], cwd);
        return result.stdout;
    }

    /**
     * Blame (annotate) a file
     */
    async blame(filePath: string, cwd: string): Promise<BlameEntry[]> {
        const result = await this.exec(['blame', '--xml', filePath], cwd);
        if (result.exitCode !== 0) {
            return [];
        }
        return SvnBlameParser.parse(result.stdout);
    }

    /**
     * Log
     */
    async log(cwd: string, filePath?: string, limit: number = 50): Promise<SvnExecResult> {
        const args = ['log', '--xml', '-v', '-l', limit.toString()];
        if (filePath) {
            args.push(filePath);
        }
        return this.exec(args, cwd);
    }
}

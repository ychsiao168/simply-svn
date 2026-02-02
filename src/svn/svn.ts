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
     * Execute an SVN command
     */
    async exec(args: string[], cwd?: string): Promise<SvnExecResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const fullArgs = ['--non-interactive', ...args];
            this.outputChannel.appendLine(`> svn ${args.join(' ')}`);

            const child = cp.spawn(this.svnPath, fullArgs, {
                cwd,
                env: process.env,
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

                if (stderr.includes('E215004') || stderr.includes('Authentication failed')) {
                    vscode.window.showWarningMessage(
                        'SVN authentication failed. Please run "svn info" in the terminal to cache your credentials.',
                        'Open Terminal'
                    ).then(choice => {
                        if (choice === 'Open Terminal') {
                            vscode.commands.executeCommand('workbench.action.terminal.new');
                        }
                    });
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
     * Get SVN version
     */
    async getVersion(): Promise<string | undefined> {
        const result = await this.exec(['--version', '--quiet']);
        if (result.exitCode === 0) {
            return result.stdout.trim();
        }
        return undefined;
    }

    /**
     * Check if a directory is an SVN repository
     */
    async isSvnRepository(path: string): Promise<boolean> {
        const result = await this.exec(['info', '--xml'], path);
        return result.exitCode === 0;
    }

    /**
     * Get repository info
     */
    async info(path: string): Promise<SvnInfo | undefined> {
        const result = await this.exec(['info', '--xml'], path);
        if (result.exitCode !== 0) {
            return undefined;
        }
        return SvnInfoParser.parse(result.stdout);
    }

    /**
     * Get working copy status
     */
    async status(path: string): Promise<StatusEntry[]> {
        const result = await this.exec(['status', '--xml'], path);
        if (result.exitCode !== 0) {
            return [];
        }
        return SvnStatusParser.parse(result.stdout);
    }

    /**
     * Add files
     */
    async add(paths: string[], cwd: string): Promise<SvnExecResult> {
        return this.exec(['add', ...paths], cwd);
    }

    /**
     * Revert files
     */
    async revert(paths: string[], cwd: string): Promise<SvnExecResult> {
        return this.exec(['revert', ...paths], cwd);
    }

    /**
     * Delete files
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
     * Get file content at a specific revision
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
     * List directory contents on the server
     */
    async ls(url: string): Promise<string[]> {
        const result = await this.exec(['ls', url]);
        if (result.exitCode !== 0) {
            return [];
        }
        return result.stdout.split('\n')
            .map(line => line.trim().replace(/\/$/, ''))
            .filter(Boolean);
    }

    /**
     * Switch working copy to a different branch URL
     */
    async switch(url: string, cwd: string): Promise<SvnExecResult> {
        return this.exec(['switch', url], cwd);
    }

    /**
     * Create a branch/tag via server-side copy
     */
    async copy(srcUrl: string, destUrl: string, message: string): Promise<SvnExecResult> {
        return this.exec(['copy', srcUrl, destUrl, '-m', message]);
    }

    /**
     * Resolve a conflicted file
     */
    async resolve(filePath: string, accept: 'working' | 'mine-full' | 'theirs-full', cwd: string): Promise<SvnExecResult> {
        return this.exec(['resolve', '--accept', accept, filePath], cwd);
    }

    /**
     * Log
     */
    async log(cwd: string, filePath?: string, limit: number = 50): Promise<SvnExecResult> {
        const args = ['log', '--xml', '-v', '-r', 'HEAD:1', '-l', limit.toString()];
        if (filePath) {
            args.push(filePath);
        }
        return this.exec(args, cwd);
    }
}

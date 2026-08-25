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

/**
 * URI scheme backing the read-only property view.
 */
export const SVN_PROPS_SCHEME = 'svn-props';

/**
 * Renders `svn proplist` output as a read-only virtual document.
 *
 * A document built from `openTextDocument({content})` would be untitled, so it
 * shows as unsaved and prompts on close; a content provider is inherently
 * read-only. Unlike SvnContentProvider this is registered once for all
 * repositories, since the viewer is reachable from the Explorer for any working
 * copy -- the target path travels in the URI and is resolved per request.
 */
export class SvnPropertyContentProvider implements vscode.TextDocumentContentProvider {
    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(private readonly resolveRepository: (fsPath: string) => SvnRepository | undefined) {}

    /**
     * Build the URI for a target's property view. The real path travels in the
     * query so the display path stays clean in the editor tab.
     *
     * Built with Uri.from rather than Uri.parse so the path is carried verbatim:
     * parsing a hand-assembled string would re-interpret characters that are
     * legal in filenames but meaningful in a URI.
     */
    static uriFor(fsPath: string, label: string): vscode.Uri {
        return vscode.Uri.from({
            scheme: SVN_PROPS_SCHEME,
            path: label,
            query: fsPath,
        });
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const fsPath = uri.query;
        const repository = this.resolveRepository(fsPath);
        if (!repository) {
            return `${fsPath} is not in an SVN working copy.\n`;
        }

        // Empty for the working copy root itself, which svn reads as an empty
        // target and answers with an empty property list rather than an error.
        const relativePath = path.relative(repository.root, fsPath) || '.';
        const properties = await repository.getProperties(relativePath);

        if (properties.length === 0) {
            return `No SVN properties on ${relativePath}\n`;
        }

        const body = properties
            .map(p => (p.value.includes('\n') ? `${p.name}:\n${p.value}` : `${p.name}: ${p.value}`))
            .join('\n');
        return `# svn properties: ${relativePath}\n\n${body}\n`;
    }

    fireChange(uri: vscode.Uri): void {
        this.onDidChangeEmitter.fire(uri);
    }
}

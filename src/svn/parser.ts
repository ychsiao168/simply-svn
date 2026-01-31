import { XMLParser } from 'fast-xml-parser';

/**
 * SVN Status Entry
 */
export interface StatusEntry {
    path: string;
    status: SvnFileStatus;
    props: SvnPropStatus;
}

export type SvnFileStatus = 
    | 'normal'
    | 'added'
    | 'deleted'
    | 'modified'
    | 'replaced'
    | 'conflicted'
    | 'ignored'
    | 'unversioned'
    | 'missing'
    | 'obstructed'
    | 'external';

export type SvnPropStatus = 'none' | 'normal' | 'modified' | 'conflicted';

/**
 * SVN Info
 */
export interface SvnInfo {
    path: string;
    url: string;
    repositoryRoot: string;
    repositoryUuid: string;
    revision: number;
    nodeKind: 'file' | 'dir';
    lastChangedAuthor?: string;
    lastChangedRev?: number;
    lastChangedDate?: string;
}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
});

/**
 * Parse svn status --xml output
 */
export class SvnStatusParser {
    static parse(xml: string): StatusEntry[] {
        const entries: StatusEntry[] = [];

        try {
            const result = parser.parse(xml);
            const status = result?.status;
            if (!status) {
                return entries;
            }

            const target = status.target;
            if (!target) {
                return entries;
            }

            // Handle single or multiple entries
            let entryList = target.entry;
            if (!entryList) {
                return entries;
            }

            if (!Array.isArray(entryList)) {
                entryList = [entryList];
            }

            for (const entry of entryList) {
                const path = entry['@_path'];
                const wcStatus = entry['wc-status'];
                
                if (path && wcStatus) {
                    entries.push({
                        path,
                        status: wcStatus['@_item'] || 'normal',
                        props: wcStatus['@_props'] || 'none',
                    });
                }
            }
        } catch (error) {
            console.error('Failed to parse SVN status XML:', error);
        }

        return entries;
    }
}

/**
 * SVN Log Entry
 */
export interface LogChangedPath {
    path: string;
    action: 'A' | 'D' | 'M' | 'R';
}

export interface LogEntry {
    revision: number;
    author: string;
    date: string;
    message: string;
    paths: LogChangedPath[];
}

/**
 * Parse svn log --xml output
 */
export class SvnLogParser {
    static parse(xml: string): LogEntry[] {
        const entries: LogEntry[] = [];

        try {
            const result = parser.parse(xml);
            let logEntries = result?.log?.logentry;
            if (!logEntries) {
                return entries;
            }

            if (!Array.isArray(logEntries)) {
                logEntries = [logEntries];
            }

            for (const entry of logEntries) {
                let pathList = entry.paths?.path;
                if (pathList && !Array.isArray(pathList)) {
                    pathList = [pathList];
                }
                const paths: LogChangedPath[] = (pathList || []).map((p: string | Record<string, string>) => ({
                    path: typeof p === 'string' ? p : p['#text'] || '',
                    action: typeof p === 'string' ? 'M' : (p['@_action'] || 'M'),
                }));

                entries.push({
                    revision: parseInt(entry['@_revision'] || '0', 10),
                    author: entry.author || '',
                    date: entry.date || '',
                    message: entry.msg || '',
                    paths,
                });
            }
        } catch (error) {
            console.error('Failed to parse SVN log XML:', error);
        }

        return entries;
    }
}

/**
 * SVN Blame Entry (per line)
 */
export interface BlameEntry {
    lineNumber: number;
    revision: number;
    author: string;
    date: string;
}

/**
 * Parse svn blame --xml output
 */
export class SvnBlameParser {
    static parse(xml: string): BlameEntry[] {
        const entries: BlameEntry[] = [];

        try {
            const result = parser.parse(xml);
            const target = result?.blame?.target;
            if (!target) {
                return entries;
            }

            let entryList = target.entry;
            if (!entryList) {
                return entries;
            }
            if (!Array.isArray(entryList)) {
                entryList = [entryList];
            }

            for (const entry of entryList) {
                entries.push({
                    lineNumber: parseInt(entry['@_line-number'] || '0', 10),
                    revision: parseInt(entry.commit?.['@_revision'] || '0', 10),
                    author: entry.commit?.author || '',
                    date: entry.commit?.date || '',
                });
            }
        } catch (error) {
            console.error('Failed to parse SVN blame XML:', error);
        }

        return entries;
    }
}

export class SvnInfoParser {
    static parse(xml: string): SvnInfo | undefined {
        try {
            const result = parser.parse(xml);
            const entry = result?.info?.entry;
            
            if (!entry) {
                return undefined;
            }

            return {
                path: entry['@_path'] || '',
                url: entry.url || '',
                repositoryRoot: entry.repository?.root || '',
                repositoryUuid: entry.repository?.uuid || '',
                revision: parseInt(entry['@_revision'] || '0', 10),
                nodeKind: entry['@_kind'] || 'dir',
                lastChangedAuthor: entry.commit?.author,
                lastChangedRev: entry.commit?.['@_revision'] 
                    ? parseInt(entry.commit['@_revision'], 10) 
                    : undefined,
                lastChangedDate: entry.commit?.date,
            };
        } catch (error) {
            console.error('Failed to parse SVN info XML:', error);
            return undefined;
        }
    }
}

import { XMLParser } from 'fast-xml-parser';

/**
 * SVN Status 項目
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
 * 解析 svn status --xml 輸出
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

            // 處理單個或多個 entry
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
 * 解析 svn info --xml 輸出
 */
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

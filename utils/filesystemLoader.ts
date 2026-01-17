import fs from 'node:fs/promises';
import path from 'node:path';
import type {AsyncTreeLeaf} from "../types";

export interface FileSystemLoaderOptions {
  rootPath?: string;
  showHidden?: boolean;
  extensions?: string[];
}

function getIcon(isDirectory: boolean): string {
  return isDirectory ? '📁' : '📄';
}

function matchesFilter(name: string, extensions?: string[]): boolean {
  if (!extensions || extensions.length === 0) return true;
  return extensions.some(ext => name.endsWith(ext));
}

export async function loadDirectory(
  dirPath: string,
  options?: { showHidden?: boolean; extensions?: string[] },
  signal?: AbortSignal
): Promise<AsyncTreeLeaf[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    const filtered = entries.filter(entry => {
      if (!options?.showHidden && entry.name.startsWith('.')) {
        return false;
      }
      if (!entry.isDirectory() && options?.extensions) {
        return matchesFilter(entry.name, options.extensions);
      }
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    return sorted.map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      const icon = getIcon(entry.isDirectory());
      
      return {
        name: `${icon} ${entry.name}`,
        value: fullPath,
        children: entry.isDirectory() 
          ? (sig?: AbortSignal) => loadDirectory(fullPath, options, sig)
          : undefined
      };
    });
  } catch (error) {
    const errorIcon = '🔒';
    return [{
      name: `${errorIcon} [Permission Denied]`,
      value: `${dirPath}:error`,
      children: undefined
    }];
  }
}


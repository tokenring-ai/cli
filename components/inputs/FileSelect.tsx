/** @jsxImportSource @opentui/react */
import {FileSystemService} from "@tokenring-ai/filesystem";
import React, { useState, useCallback } from 'react';
import type {AsyncTreeLeaf, FileSelectProps} from '../../types';
import {PreviewPanel} from '../common';
import {theme} from '../../theme';
import TreeSelect from './TreeSelect';

export default function FileSelect({ agent, question: { allowFiles, allowDirectories, ...treeSelectQuestion}, onResponse, signal }: FileSelectProps) {
  const fileSystemService = agent.requireServiceByType(FileSystemService);
  const [previewData, setPreviewData] = useState<Record<string, string> | null>(null);

  const handleHighlight = useCallback(async (filePath: string) => {
    try {
      const stat = await fileSystemService.stat(filePath, agent);
      const details: Record<string, string> = {
        'Path': stat.path,
        'Type': stat.isDirectory ? 'Directory' : stat.isFile ? 'File' : 'Unknown',
      };
      
      if (stat.size !== undefined) {
        details['Size'] = formatBytes(stat.size);
      }
      
      if (stat.modified) {
        details['Modified'] = new Date(stat.modified).toLocaleString();
      }
      
      if (stat.isDirectory) {
        details['Type'] = 'Directory';
      }
      
      setPreviewData(details);
    } catch (e) {
      setPreviewData({
        'Path': filePath,
        'Error': e instanceof Error ? e.message : 'Failed to stat file'
      });
    }
  }, [fileSystemService, agent]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  //TODO: the tree selector does not highlight directories with selected files in them
  const buildTree = async (path = ""): Promise<Array<AsyncTreeLeaf>> => {
    const children: Array<AsyncTreeLeaf> = [];

    for await (const itemPath of fileSystemService.getDirectoryTree(path, {
      ignoreFilter: (itemPath) => false,
      recursive: false,
    }, agent)) {
      if (itemPath.endsWith("/")) {
        // Directory
        const dirName = itemPath
          .substring(0, itemPath.length - 1)
          .split("/")
          .pop()!;
        children.push({
          name: dirName,
          ...(allowDirectories && {value: itemPath}),
          children: () => buildTree(itemPath),
        });
      } else if (allowFiles) {
        // File
        const fileName = itemPath.split("/").pop()!;
        children.push({
          name: fileName,
          value: itemPath,
        });
      }
    }

    return children;
  };

  const question = {
    ...treeSelectQuestion,
    tree:{
      name: "File Selection",
      children: buildTree,
    }
  };

  return (
    <box flexDirection="row" flexGrow={1}>
      <box flexGrow={1}>
        <TreeSelect question={question} onResponse={onResponse} signal={signal} onHighlight={handleHighlight} />
      </box>
      {previewData && (
        <box width={35} marginLeft={1}>
          <PreviewPanel title="File Info" details={previewData} />
        </box>
      )}
    </box>
  );
}
/** @jsxImportSource @opentui/react */
import {FileSystemService} from "@tokenring-ai/filesystem";
import React from 'react';
import type {AsyncTreeLeaf, FileSelectProps} from '../../types';
import TreeSelect from './TreeSelect';

export default function FileSelect({ agent, question: { allowFiles, allowDirectories, ...treeSelectQuestion}, onResponse, signal }: FileSelectProps) {
  const fileSystemService = agent.requireServiceByType(FileSystemService);
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

  return <TreeSelect question={question} onResponse={onResponse} signal={signal} />;
}
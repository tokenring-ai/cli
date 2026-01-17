/** @jsxImportSource @opentui/react */
import React from 'react';
import { theme } from '../../theme';

interface PreviewPanelProps {
  title: string;
  details: Record<string, string>;
}

export default function PreviewPanel({ title, details }: PreviewPanelProps) {
  return (
    <box flexDirection="column" borderStyle="single" paddingLeft={1} paddingRight={1} title={title}>
      <text fg={theme.boxTitle}>{title}</text>
      {Object.entries(details).map(([key, value]) => (
        <box key={key}>
          <text fg={theme.treeNotSelectedItem}>{key}: </text>
          <text fg={theme.chatOutputText}>{value}</text>
        </box>
      ))}
    </box>
  );
}

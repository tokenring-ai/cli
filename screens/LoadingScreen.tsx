/** @jsxImportSource @opentui/react */
import React, { useEffect } from 'react';
import { z } from 'zod';

import {CLIConfigSchema} from "../schema.ts";

interface LoadingScreenProps {
  config: z.output<typeof CLIConfigSchema>;
  onResponse: (unused: null) => void;
}

export default function LoadingScreen({
  config,
  onResponse,
}: LoadingScreenProps) {
  useEffect(() => {
    const timer = setTimeout(() => onResponse(null), 2000);
    return () => clearTimeout(timer);
  }, [onResponse, config]);

  return (
    <box
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      width="100%"
      height="100%"
      backgroundColor="#0284c7"
    >
      <box
        borderStyle="rounded"
        borderColor="#06b6d4"
        paddingLeft={4}
        paddingRight={4}
        paddingTop={2}
        paddingBottom={2}
        backgroundColor="#0369a1"
      >
        <text fg="#f0f9ff">{config.loadingBanner}</text>
      </box>
    </box>
  );
}

/** @jsxImportSource @opentui/react */
import {useTerminalDimensions} from "@opentui/react";
import React, {useEffect} from 'react';
import {z} from 'zod';

import {CLIConfigSchema} from "../schema.ts";
import {theme} from "../theme.ts";

interface LoadingScreenProps {
  config: z.output<typeof CLIConfigSchema>;
  onResponse: (unused: null) => void;
}

export default function LoadingScreen({
  config,
  onResponse,
}: LoadingScreenProps) {
  const { width } = useTerminalDimensions();

  useEffect(() => {
    const timer = setTimeout(() => onResponse(null), 2000);
    return () => clearTimeout(timer);
  }, [onResponse, config]);

  const wideBannerWidth = config.loadingBannerWide.split(/\n/).reduce((acc, line) => Math.max(acc, line.length), 0);
  const narrowBannerWidth = config.loadingBannerNarrow.split(/\n/).reduce((acc, line) => Math.max(acc, line.length), 0);

  return (
    <box
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      width="100%"
      height="100%"
      backgroundColor={theme.loadingScreenBackground}
    >
      <box
        paddingLeft={4}
        paddingRight={4}
        paddingTop={2}
        paddingBottom={2}
        backgroundColor={theme.loadingScreenBannerBackground}
      >
        <text fg={theme.loadingScreenText}>
          {   width > wideBannerWidth ? config.loadingBannerWide
            : width > narrowBannerWidth ? config.loadingBannerNarrow
            : config.loadingBannerCompact
          }</text>
      </box>
    </box>
  );
}

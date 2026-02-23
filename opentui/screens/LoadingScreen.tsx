/** @jsxImportSource @opentui/react */
import {useTerminalDimensions} from "@opentui/react";
import React, {useEffect, useReducer, useState} from 'react';
import {z} from 'zod';

import {CLIConfigSchema} from "../../schema.ts";
import {theme} from "../../theme.ts";

const loadingTasks = [
  "Reticulating splines",
  "Charging flux capacitor",
  "Herding cats",
  "Downloading more RAM",
  "Inverting the binary tree",
  "Locating the 'any' key",
  "Adjusting the coffee-to-code ratio",
  "Calculating the ultimate answer",
  "Polishing pixels",
  "Feeding the hamsters",
];
interface LoadingScreenProps {
  config: z.output<typeof CLIConfigSchema>;
  onResponse: (unused: null) => void;
}

export default function LoadingScreen({
  config,
  onResponse,
}: LoadingScreenProps) {
  const { width } = useTerminalDimensions();
  const [progress, bumpProgress] = useReducer((prev) => prev + 1, 0);

  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const currentSpinner = spinnerFrames[progress % spinnerFrames.length];


  useEffect(() => {
    const timer = setInterval(bumpProgress, 100);
    return () => clearInterval(timer);
  }, []);

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
      <box paddingTop={1} paddingBottom={2}>
        <text fg={theme.loadingScreenText}>
          {currentSpinner} {loadingTasks[Math.floor(progress / 10) % loadingTasks.length]}
        </text>
      </box>
    </box>
  );
}

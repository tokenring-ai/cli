/** @jsxImportSource @opentui/react */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import type { ScreenName, ScreenProps, ScreenResponse } from "./screens/ScreenRegistry.js";
import type { HumanInterfaceRequestFor, HumanInterfaceResponseFor } from '@tokenring-ai/agent/HumanInterfaceRequest';

const getCursorPosition = () : Promise<{row: number, col: number}> => {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.once('data', (data) => {
      const match = /\[(\d+);(\d+)R/.exec(data.toString());
      if (match) {
        const position = { row: parseInt(match[1]), col: parseInt(match[2]) };
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve(position);
      }
    });

    process.stdout.write('\u001b[6n');
  });
};

const renderScreen = async <T,>(
    Component: React.ComponentType<any>,
    props: any
): Promise<T> => {
  const initialPosition = await getCursorPosition();

  const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: true,
  });
  const root = createRoot(renderer);

  return new Promise<T>((resolve) => {
      function handleResponse(response: T) {
          root.unmount();
          renderer.pause();
          renderer.stop();
          renderer.destroy();

        process.stdout.write(`\x1b[${initialPosition.row};${initialPosition.col}H`);

        resolve(response);
      }

      const C = Component as any;
      root.render(<C {...props} onResponse={handleResponse} />);
  });
};

export async function runOpenTUIScreen(
    Component: React.ComponentType<any>,
    props: any
): Promise<any> {
  return renderScreen<any>(Component, props);
}

export async function runAgentSelectionScreen(
    Component: React.ComponentType<ScreenProps<'AgentSelectionScreen'> & { onResponse: (response: ScreenResponse<'AgentSelectionScreen'>) => void }>,
    props: ScreenProps<'AgentSelectionScreen'>
): Promise<ScreenResponse<'AgentSelectionScreen'>> {
  return renderScreen<ScreenResponse<'AgentSelectionScreen'>>(Component, props);
}

export async function runAskScreen(
    Component: React.ComponentType<ScreenProps<'AskScreen'> & { onResponse: (response: ScreenResponse<'AskScreen'>) => void }>,
    props: ScreenProps<'AskScreen'>
): Promise<ScreenResponse<'AskScreen'>> {
  return renderScreen<ScreenResponse<'AskScreen'>>(Component, props);
}

export async function runConfirmationScreen(
    Component: React.ComponentType<ScreenProps<'ConfirmationScreen'> & { onResponse: (response: ScreenResponse<'ConfirmationScreen'>) => void }>,
    props: ScreenProps<'ConfirmationScreen'>
): Promise<ScreenResponse<'ConfirmationScreen'>> {
  return renderScreen<ScreenResponse<'ConfirmationScreen'>>(Component, props);
}

export async function runTreeSelectionScreen<
  K extends 'askForSingleTreeSelection' | 'askForMultipleTreeSelection'
>(
    Component: React.ComponentType<any>,
    props: { request: HumanInterfaceRequestFor<K> }
): Promise<HumanInterfaceResponseFor<K>> {
  return renderScreen<HumanInterfaceResponseFor<K>>(Component, props);
}

export async function runWebPageScreen(
    Component: React.ComponentType<ScreenProps<'WebPageScreen'> & { onResponse: (response: ScreenResponse<'WebPageScreen'>) => void }>,
    props: ScreenProps<'WebPageScreen'>
): Promise<ScreenResponse<'WebPageScreen'>> {
  return renderScreen<ScreenResponse<'WebPageScreen'>>(Component, props);
}

export async function runPasswordScreen(
    Component: React.ComponentType<ScreenProps<'PasswordScreen'> & { onResponse: (response: ScreenResponse<'PasswordScreen'>) => void }>,
    props: ScreenProps<'PasswordScreen'>
): Promise<ScreenResponse<'PasswordScreen'>> {
  return renderScreen<ScreenResponse<'PasswordScreen'>>(Component, props);
}

/** @jsxImportSource @opentui/react */

import {createCliRenderer} from "@opentui/core";
import {createRoot} from "@opentui/react";
import React from "react";

export const renderScreen = async <P, R = P>(
  Component: React.ComponentType<P & { onResponse: (response: R) => void; signal?: AbortSignal }>,
  props: P,
  signal: AbortSignal
): Promise<R> => {

  const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: true,
  });
  const root = createRoot(renderer);

  return new Promise<R>((resolve, reject) => {
    function handleResponse(response: R) {
      root.unmount();
          renderer.pause();
          renderer.stop();
          renderer.destroy();

        process.stdin.resume();
        
        resolve(response);
      }

      const abortHandler = () => {
        root.unmount();
        renderer.pause();
        renderer.stop();
        renderer.destroy();
        process.stdin.resume();
        reject(new Error('Aborted'));
      };

    signal.addEventListener('abort', abortHandler, {once: true});

      const C = Component as any;
      root.render(<C {...props} onResponse={handleResponse} signal={signal} />);
  });
};

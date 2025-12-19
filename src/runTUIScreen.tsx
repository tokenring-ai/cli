/** @jsxImportSource @opentui/react */

import {createCliRenderer} from "@opentui/core";
import {createRoot} from "@opentui/react";
import React from "react";

export const renderScreen = async <P, R = P>(
  Component: React.ComponentType<P & { onResponse: (response: R) => void }>,
  props: P
): Promise<R> => {

  const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: true,
  });
  const root = createRoot(renderer);

  return new Promise<R>((resolve) => {
    function handleResponse(response: R) {
      root.unmount();
          renderer.pause();
          renderer.stop();
          renderer.destroy();

        process.stdin.resume();
        
        resolve(response);
      }

      const C = Component as any;
      root.render(<C {...props} onResponse={handleResponse} />);
  });
};

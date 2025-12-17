import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";


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


export async function runOpenTUIScreen<T>(
    Component: React.ElementType<{ onResponse: (response: T) => void }>,
    props: any
): Promise<T> {
  const initialPosition = await getCursorPosition();

  const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: true,
  });
  const root = createRoot(renderer);

  return new Promise<T>((resolve) => {
      function handleResponse(response: T) {
          // We need to unmount and cleanup before resolving
          root.unmount();
          renderer.pause();
          renderer.stop();
          renderer.destroy();

        // Restore the cursor position
        process.stdout.write(`\x1b[${initialPosition.row};${initialPosition.col}H`);

        resolve(response);
      }

      const C = Component as any;
      root.render(<C {...props} onResponse={handleResponse} />);
  });
}

import {FullScreenBox} from "fullscreen-ink";
import {render} from "ink";
import React from "react";

function writeToStdout(content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(content, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export const renderScreen = async <P, R = P>(
  Component: React.ComponentType<P & {onResponse: (response: R) => void; signal?: AbortSignal}>,
  props: P,
  signal: AbortSignal,
): Promise<R> => {
  if (signal.aborted) {
    throw new Error("Aborted");
  }

  process.stdin.resume();
  await writeToStdout("\x1b[?1049h");

  return new Promise<R>((resolve, reject) => {
    let finished = false;

    const instance = render(
      <FullScreenBox>
        <Component
          {...props}
          onResponse={(response: R) => {
            void finish(() => resolve(response));
          }}
          signal={signal}
        />
      </FullScreenBox>,
      {
        exitOnCtrlC: false,
      },
    );

    const finish = async (settle: () => void): Promise<void> => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abortHandler);

      instance.unmount();

      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
      } finally {
        instance.cleanup();
        await writeToStdout("\x1b[?1049l");
        process.stdin.resume();
        settle();
      }
    };

    const abortHandler = () => {
      void finish(() => reject(new Error("Aborted")));
    };

    signal.addEventListener("abort", abortHandler, {once: true});
  });
};

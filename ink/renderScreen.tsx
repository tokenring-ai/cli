import {withFullScreen} from 'fullscreen-ink';
import React from 'react';


export const renderScreen = async <P, R = P>(
  Component: React.ComponentType<P & { onResponse: (response: R) => void; signal?: AbortSignal }>,
  props: P,
  signal: AbortSignal
): Promise<R> => {
  return new Promise<R>((resolve, reject) => {
    const fullScreenApp = withFullScreen(
      <Component
        {...props}
        onResponse={(response: R) => {
          fullScreenApp.instance.unmount();
          resolve(response);
        }}
        signal={signal}
      />
    );

    const abortHandler = () => {
      fullScreenApp.instance.unmount();
      reject(new Error('Aborted'));
    };

    signal.addEventListener('abort', abortHandler, {once: true});

    fullScreenApp.start().catch(reject);
  });
};

/** @jsxImportSource @opentui/react */

import {HumanInterfaceRequestFor, HumanInterfaceResponseFor} from '@tokenring-ai/agent/HumanInterfaceRequest';
import open from 'open';
import React, {useEffect} from 'react';

interface WebPageScreenProps {
  request: HumanInterfaceRequestFor<'openWebPage'>;
  onResponse: (response: HumanInterfaceResponseFor<'openWebPage'>) => void;
  signal?: AbortSignal;
}

export default function WebPageScreen({ request, onResponse, signal }: WebPageScreenProps) {
  useEffect(() => {
    if (signal?.aborted) {
      onResponse(false);
      return;
    }

    const abortHandler = () => onResponse(false);
    signal?.addEventListener('abort', abortHandler);

    open(request.url)
      .then(() => onResponse(true))
      .catch(err => onResponse(false));

    return () => signal?.removeEventListener('abort', abortHandler);
  }, [request.url, onResponse, signal]);

  return <text>Opening {request.url}...</text>;
}

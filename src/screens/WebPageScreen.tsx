import {HumanInterfaceRequestFor, HumanInterfaceResponseFor} from '@tokenring-ai/agent/HumanInterfaceRequest';
import open from 'open';
import React, {useEffect} from 'react';

interface WebPageScreenProps {
  request: HumanInterfaceRequestFor<'openWebPage'>;
  onResponse: (response: HumanInterfaceResponseFor<'openWebPage'>) => void;
}

export default function WebPageScreen({ request, onResponse }: WebPageScreenProps) {
  useEffect(() => {
    open(request.url)
      .then(() => onResponse(true))
      .catch(err => onResponse(false));
  }, [request.url, onResponse]);

  return <text>Opening {request.url}...</text>;
}

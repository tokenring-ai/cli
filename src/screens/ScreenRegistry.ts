/** @jsxImportSource @opentui/react */

import type Agent from '@tokenring-ai/agent/Agent';
import type {HumanInterfaceRequestFor, HumanInterfaceResponseFor} from '@tokenring-ai/agent/HumanInterfaceRequest';
import type AgentManager from '@tokenring-ai/agent/services/AgentManager';
import type {WebHostService} from '@tokenring-ai/web-host';
import type React from 'react';

type ScreenRegistryEntry<P extends Record<string, any>, R> = {
  props: P;
  response: R;
  component: React.ComponentType<P & { onResponse: (response: R) => void }>;
};

export type ScreenRegistry = {
  AgentSelectionScreen: ScreenRegistryEntry<
    {
      agentManager: AgentManager;
      webHostService?: WebHostService;
      banner: string;
    },
    Agent | null
  >;
  AskScreen: ScreenRegistryEntry<
    { request: HumanInterfaceRequestFor<'askForText'> },
    HumanInterfaceResponseFor<'askForText'>
  >;
  ConfirmationScreen: ScreenRegistryEntry<
    { message: string; defaultValue?: boolean; timeout?: number },
    boolean
  >;
  TreeSelectionScreen: {
    props: {
      request:
        | HumanInterfaceRequestFor<'askForSingleTreeSelection'>
        | HumanInterfaceRequestFor<'askForMultipleTreeSelection'>;
    };
    response: HumanInterfaceResponseFor<'askForSingleTreeSelection'> | HumanInterfaceResponseFor<'askForMultipleTreeSelection'>;
    component: React.ComponentType<{
      request:
        | HumanInterfaceRequestFor<'askForSingleTreeSelection'>
        | HumanInterfaceRequestFor<'askForMultipleTreeSelection'>;
      onResponse: (response: HumanInterfaceResponseFor<'askForSingleTreeSelection'> | HumanInterfaceResponseFor<'askForMultipleTreeSelection'>) => void;
    }>;
  };
  WebPageScreen: ScreenRegistryEntry<
    { request: HumanInterfaceRequestFor<'openWebPage'> },
    HumanInterfaceResponseFor<'openWebPage'>
  >;
  PasswordScreen: ScreenRegistryEntry<
    { request: HumanInterfaceRequestFor<'askForPassword'> },
    HumanInterfaceResponseFor<'askForPassword'>
  >;
  FormScreen: ScreenRegistryEntry<
    { request: HumanInterfaceRequestFor<'askForForm'> },
    HumanInterfaceResponseFor<'askForForm'>
  >;
};

export type ScreenName = keyof ScreenRegistry;
export type ScreenProps<K extends ScreenName> = ScreenRegistry[K]['props'];
export type ScreenResponse<K extends ScreenName> = ScreenRegistry[K]['response'];

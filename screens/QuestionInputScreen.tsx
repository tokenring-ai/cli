/** @jsxImportSource @opentui/react */

import {Agent} from "@tokenring-ai/agent";
import { QuestionRequestSchema } from "@tokenring-ai/agent/HumanInterfaceRequest";
import TokenRingApp from "@tokenring-ai/app";
import React from 'react';
import { z } from 'zod';
import { TextInput, SelectInput, TreeSelect, FileSelect, FormInput } from '../components/inputs';

import {CLIConfigSchema} from "../schema.ts";
import { theme } from '../theme.ts';
import type {TreeSelectProps} from "../types";

type QuestionInputScreenProps = {
  agent: Agent;
  request: z.output<typeof QuestionRequestSchema>;
  config: z.output<typeof CLIConfigSchema>;
  onResponse: (response: any) => void;
  signal?: AbortSignal;
};

export default function QuestionInputScreen({ agent, request, config, onResponse, signal }: QuestionInputScreenProps) {
  const { question, message } = request;

  function inputComponent() {
    switch (question.type) {
      case 'treeSelect':
        return <TreeSelect question={question} onResponse={onResponse} signal={signal}/>;
      case 'text':
        return <TextInput question={question} message={message} onResponse={onResponse} signal={signal}/>;
      case 'select':
        return <SelectInput question={question} message={message} onResponse={onResponse} signal={signal}/>;
      case 'fileSelect':
        return <FileSelect question={question} agent={agent} message={message} onResponse={onResponse} signal={signal}/>;
      case 'form':
        return <FormInput question={question} agent={agent} message={message} onResponse={onResponse} signal={signal}/>;
      default:
        return <box>
          <text>Unknown question type</text>
        </box>;
    }
  }

  return (
    <box flexDirection="column">
      <box><text fg={theme.agentSelectionBanner}>{config.screenBanner}</text></box>
      <box><text>{message}</text></box>
      <box flexGrow={1} flexDirection="column">
        {inputComponent()}
      </box>
    </box>
  );
}



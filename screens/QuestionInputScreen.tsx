/** @jsxImportSource @opentui/react */

import {useTerminalDimensions} from "@opentui/react";
import {Agent} from "@tokenring-ai/agent";
import {QuestionRequestSchema} from "@tokenring-ai/agent/HumanInterfaceRequest";
import React from 'react';
import {z} from 'zod';
import {FileSelect, FormInput, SelectInput, TextInput, TreeSelect} from '../components/inputs';

import {CLIConfigSchema} from "../schema.ts";
import {theme} from '../theme.ts';

type QuestionInputScreenProps = {
  agent: Agent;
  request: z.output<typeof QuestionRequestSchema>;
  config: z.output<typeof CLIConfigSchema>;
  onResponse: (response: any) => void;
  signal?: AbortSignal;
};

export default function QuestionInputScreen({ agent, request, config, onResponse, signal }: QuestionInputScreenProps) {
  const { height, width } = useTerminalDimensions();
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
    <box flexDirection="column" height={ height } backgroundColor={theme.screenBackground}>
      <box>
        <box><text fg={theme.questionScreenBanner}>{config.screenBanner}</text></box>
        <box><text>{message}</text></box>
      </box>
      <box style={{ height: '100%' }} backgroundColor={theme.panelBackground}>
        {inputComponent()}
      </box>
    </box>
  );
}



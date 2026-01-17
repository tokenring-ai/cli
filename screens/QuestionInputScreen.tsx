/** @jsxImportSource @opentui/react */

import {Agent} from "@tokenring-ai/agent";
import { QuestionRequestSchema } from "@tokenring-ai/agent/HumanInterfaceRequest";
import TokenRingApp from "@tokenring-ai/app";
import React from 'react';
import { z } from 'zod';
import { TextInput, SelectInput, TreeSelect, FileSelect } from '../components/inputs';

type QuestionInputScreenProps = {
  agent: Agent;
  request: z.output<typeof QuestionRequestSchema>;
  onResponse: (response: any) => void;
  signal?: AbortSignal;
};

export default function QuestionInputScreen({ agent, request, onResponse, signal }: QuestionInputScreenProps) {
  const { question, message } = request;

  if (question.type === 'treeSelect') {
    return <TreeSelect question={question} onResponse={onResponse} signal={signal} />;
  }

  if (question.type === 'text') {
    return <TextInput question={question} message={message} onResponse={onResponse} signal={signal} />;
  }

  if (question.type === 'select') {
    return <SelectInput question={question} message={message} onResponse={onResponse} signal={signal} />;
  }

  if (question.type === 'fileSelect') {
    return <FileSelect question={question} agent={agent} message={message} onResponse={onResponse} signal={signal} />;
  }

  return <box><text>Unknown question type</text></box>;
}



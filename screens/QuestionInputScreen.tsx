/** @jsxImportSource @opentui/react */

import { QuestionRequestSchema } from "@tokenring-ai/agent/HumanInterfaceRequest";
import React from 'react';
import { z } from 'zod';
import { TextInput, SelectInput, TreeSelect, FileSelect } from '../components/inputs';

type QuestionInputScreenProps = {
  request: z.output<typeof QuestionRequestSchema>;
  onResponse: (response: any) => void;
  signal?: AbortSignal;
};

export default function QuestionInputScreen({ request, onResponse, signal }: QuestionInputScreenProps) {
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
    return <FileSelect question={question} message={message} onResponse={onResponse} signal={signal} />;
  }

  return <box><text>Unknown question type</text></box>;
}



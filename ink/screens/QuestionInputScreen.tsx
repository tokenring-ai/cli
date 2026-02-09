import {Box, Text} from 'ink';
import {Agent} from "@tokenring-ai/agent";
import {type ParsedQuestionRequest} from "@tokenring-ai/agent/AgentEvents";
import React from 'react';
import {z} from 'zod';
import FileSelect from "../components/inputs/FileSelect.tsx";
import FormInput from "../components/inputs/FormInput.tsx";
import TextInput from "../components/inputs/TextInput.tsx";
import TreeSelect from "../components/inputs/TreeSelect.tsx";
import {useResponsiveLayout} from "../hooks/useResponsiveLayout.ts";

import {CLIConfigSchema} from "../../schema.ts";
import {theme} from '../../theme.ts';

type QuestionInputScreenProps = {
  agent: Agent;
  request: ParsedQuestionRequest;
  config: z.output<typeof CLIConfigSchema>;
  onResponse: (response: any) => void;
  signal?: AbortSignal;
};

export default function QuestionInputScreen({ agent, request, config, onResponse, signal }: QuestionInputScreenProps) {
  const layout = useResponsiveLayout();
  const { question, message } = request;

  function inputComponent() {
    switch (question.type) {
      case 'treeSelect':
        return <TreeSelect question={question} onResponse={onResponse} signal={signal}/>;
      case 'text':
        return <TextInput question={question} onResponse={onResponse} signal={signal}/>;
      case 'fileSelect':
        return <FileSelect question={question} agent={agent} onResponse={onResponse} signal={signal}/>;
      case 'form':
        return <FormInput question={question} agent={agent} onResponse={onResponse} signal={signal}/>;
      default:
        return <Box>
          <Text>Unknown question type</Text>
        </Box>;
    }
  }

  return (
    <Box
      flexDirection="column"
      width="100%"
      height="100%"
    >
      <Box flexDirection="row" paddingBottom={layout.isShort ? 0 : 1}>
        <Box flexGrow={1}><Text color={theme.questionScreenBanner}>{config.screenBanner}</Text></Box>
        { layout.isNarrow ? null : <Box><Text> https://tokenring.ai</Text></Box> }
      </Box>
      <Box paddingBottom={layout.isShort ? 0 : 1}><Text>{ message }</Text></Box>
      <Box flexDirection="column" flexGrow={1} >
        <Box flexDirection="column" flexGrow={1}>
          {inputComponent()}
        </Box>
      </Box>
    </Box>
  );
}

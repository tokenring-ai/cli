import {Agent} from "@tokenring-ai/agent";
import {FileSelectQuestionSchema, type QuestionRequestSchema, TreeSelectQuestionSchema} from "@tokenring-ai/agent/HumanInterfaceRequest";
import TokenRingApp from "@tokenring-ai/app";
import type { z } from "zod";

export interface BaseInputProps {
  message?: string;
  onResponse: (response: any) => void;
  signal?: AbortSignal;
}

export interface TextInputProps extends BaseInputProps {
  question: z.output<typeof QuestionRequestSchema>['question'] & { type: 'text' };
  onResponse: (response: string | null) => void;
}

export interface SelectInputProps extends BaseInputProps {
  question: z.output<typeof QuestionRequestSchema>['question'] & { type: 'select' };
  onResponse: (response: string[] | null) => void;
}

export type AsyncTreeLeaf = {
  name: string;
  value?: string;
  children?: Array<AsyncTreeLeaf> | (() => Promise<AsyncTreeLeaf[]> | AsyncTreeLeaf[]) | ((signal: AbortSignal) => Promise<AsyncTreeLeaf[]> | AsyncTreeLeaf[]);
};


export interface TreeSelectProps extends BaseInputProps {
  question: Omit<z.output<typeof TreeSelectQuestionSchema>, "type" | "tree"> & {
    tree: AsyncTreeLeaf
  };
  onResponse: (response: string[] | null) => void;
  onHighlight?: (value: string) => void;
}

export interface FileSelectProps extends BaseInputProps {
  agent: Agent;
  question: Omit<z.output<typeof FileSelectQuestionSchema>, "type">;
  onResponse: (response: string[] | null) => void;
}

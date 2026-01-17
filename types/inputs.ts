import type { QuestionRequestSchema } from "@tokenring-ai/agent/HumanInterfaceRequest";
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

export interface TreeSelectProps extends BaseInputProps {
  question: z.output<typeof QuestionRequestSchema>['question'] & { type: 'treeSelect' };
  onResponse: (response: string[] | null) => void;
}

export interface FileSelectProps extends BaseInputProps {
  question: z.output<typeof QuestionRequestSchema>['question'] & { type: 'fileSelect' };
  onResponse: (response: string[] | null) => void;
}

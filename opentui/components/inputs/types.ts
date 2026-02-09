import {Agent} from "@tokenring-ai/agent";
import {FileSelectQuestionSchema, FormQuestionSchema, TextQuestionSchema,} from "@tokenring-ai/agent/question";
import type {z} from "zod";

export interface TextInputProps {
  question: Omit<z.output<typeof TextQuestionSchema>, "type">;
  onResponse: (response: string | null) => void;
  signal?: AbortSignal;
}

export interface FileSelectProps{
  agent: Agent;
  question: Omit<z.output<typeof FileSelectQuestionSchema>, "type">;
  onResponse: (response: string[] | null) => void;
  signal?: AbortSignal;
}

export interface FormInputProps {
  agent: Agent;
  question: Omit<z.output<typeof FormQuestionSchema>, "type">;
  onResponse: (response: Record<string, Record<string, string | string[] | null>> | null) => void;
  signal?: AbortSignal;
}

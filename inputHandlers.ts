import {confirm} from "@inquirer/prompts";
import {
  AskForCommandOptions,
  AskForConfirmationOptions,
  AskForMultipleSelectionOptions,
  AskForMultipleTreeSelectionOptions,
  AskForSelectionOptions,
  AskForSingleTreeSelectionOptions,
} from "@tokenring-ai/agent/HumanInterfaceProvider";
import {AskRequest, OpenWebPageRequest} from "@tokenring-ai/agent/HumanInterfaceRequest";
import commandPrompt from "@tokenring-ai/inquirer-command-prompt";
import {treeSelector} from "@tokenring-ai/inquirer-tree-selector";
import chalk from "chalk";
import inquirer from "inquirer";
import open from "open";

let abortController = new AbortController();

process.on("SIGINT", () => abortController.abort());

export const CancellationToken = Symbol("CancellationToken");
export const ExitToken = Symbol("ExitToken");

export async function askForCommand(options: AskForCommandOptions): Promise<string | typeof ExitToken | typeof CancellationToken> {
  if (abortController.signal.aborted) abortController = new AbortController();

  let emptyPrompt = true;
  try {
    return await commandPrompt(
      {
        theme: {
          prefix: chalk.yellowBright("user"),
        },
        transformer: (input: string) => {
          if (input.length > 0) {
            emptyPrompt = false;
          }
          return input;
        },
        message: chalk.yellowBright(">"),
        autoCompletion: options.autoCompletion,
        history: options.history,
      },
      {
        signal: abortController.signal,
      },
    );
  } catch (e) {
    if (emptyPrompt) return ExitToken;
    return CancellationToken;
  }
}

export async function askForConfirmation(options: AskForConfirmationOptions) {
  return confirm(options);
}

export async function openWebPage({url}: OpenWebPageRequest): Promise<void> {
  await open(url);
}

/**
 * Asks the user to select an item from a list using a REPL interface.
 */
export async function askForSelection({
                                        title,
                                        items,
                                      }: AskForSelectionOptions): Promise<string> {
  const {selection} = await inquirer.prompt<{ selection: string }>([
    {
      type: "list",
      name: "selection",
      message: title,
      choices: items,
      loop: false,
    },
  ]);

  return selection;
}

/**
 * Asks the user a question and allows them to type in a multi-line answer using a REPL interface.
 */
export async function ask({question}: AskRequest): Promise<string> {
  const {answer} = await inquirer.prompt<{ answer: string }>({
    type: "editor",
    name: "answer",
    message: question,
  });
  return answer;
}

/**
 * Asks the user to select multiple items from a list using a REPL interface.
 */
export async function askForMultipleSelections({
                                                 title,
                                                 items,
                                                 message,
                                               }: AskForMultipleSelectionOptions): Promise<string[]> {
  const {selections} = await inquirer.prompt<{ selections: string[] }>([
    {
      type: "checkbox",
      name: "selections",
      message: message || title,
      choices: Array.from(items),
      loop: false,
    },
  ]);

  return selections;
}

/**
 * Asks the user to select items from a tree structure using a REPL interface.
 */
export async function askForSingleTreeSelection({
                                                  message,
                                                  tree,
                                                  initialSelection,
                                                  loop = false,
                                                }: AskForSingleTreeSelectionOptions): Promise<string | null> {
  return await treeSelector({
    message: message ?? "",
    tree: tree,
    multiple: false,
    allowCancel: true,
    loop,
    pageSize: 20,
    ...(initialSelection && {initialSelection}),
  });
}

/**
 * Asks the user to select items from a tree structure using a REPL interface.
 */
export async function askForMultipleTreeSelection({
                                                    message,
                                                    tree,
                                                    initialSelection,
                                                    loop = false,
                                                  }: AskForMultipleTreeSelectionOptions): Promise<string[] | null> {
  return await treeSelector({
    message: message ?? "",
    tree: tree,
    multiple: true,
    allowCancel: true,
    loop,
    pageSize: 20,
    ...(initialSelection && {initialSelection: Array.from(initialSelection)}),
  });
}




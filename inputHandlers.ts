import {confirm, editor, password, select} from "@inquirer/prompts";
import {select as selectPro} from "inquirer-select-pro";
import {
  AskForCommandOptions,
  AskForConfirmationOptions,
  AskForMultipleSelectionOptions,
  AskForMultipleTreeSelectionOptions,
  AskForSelectionOptions,
  AskForSingleTreeSelectionOptions,
} from "@tokenring-ai/agent/HumanInterfaceRequest";
import {AskForPasswordOptions, AskRequest, OpenWebPageRequest} from "@tokenring-ai/agent/HumanInterfaceRequest";
import commandPrompt from "@tokenring-ai/inquirer-command-prompt";
import {treeSelector} from "@tokenring-ai/inquirer-tree-selector";
import chalk from "chalk";
import open from "open";

export const CancellationToken = Symbol("CancellationToken");
export const ExitToken = Symbol("ExitToken");

export async function askForCommand(options: AskForCommandOptions, signal: AbortSignal): Promise<string | typeof ExitToken | typeof CancellationToken> {
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
        signal,
      },
    );
  } catch (e) {
    if (emptyPrompt) return ExitToken;
    return CancellationToken;
  }
}

export async function askForConfirmation(options: AskForConfirmationOptions, signal: AbortSignal) {
  return confirm(options, { signal });
}

export async function askForPassword(options: AskForPasswordOptions, signal: AbortSignal) {
  return password(options, { signal})
}

export async function openWebPage({url}: OpenWebPageRequest): Promise<void> {
  await open(url);
}

/**
 * Asks the user to select an item from a list using a REPL interface.
 */
export async function askForSelection({
                                        message,
                                        choices
                                      }: AskForSelectionOptions, signal: AbortSignal): Promise<string> {
  return select({
    message,
    choices,
    loop: false
  }, {signal});
}

/**
 * Asks the user a question and allows them to type in a multi-line answer using a REPL interface.
 */
export async function ask(options: AskRequest, signal: AbortSignal): Promise<string> {
  return editor(options, {signal});
}

/**
 * Asks the user to select multiple items from a list using a REPL interface.
 */
export async function askForMultipleSelections({
                                                 options,
                                                 message
                                               }: AskForMultipleSelectionOptions, signal: AbortSignal): Promise<string[]> {
  return selectPro({
    message,
    options,
    loop: false
  }, {signal});
}

/**
 * Asks the user to select items from a tree structure using a REPL interface.
 */
export async function askForSingleTreeSelection({
                                                  message,
                                                  tree,
                                                  initialSelection,
                                                  loop = false
                                                }: AskForSingleTreeSelectionOptions, signal: AbortSignal): Promise<string | null> {
  return await treeSelector({
    message: message ?? "",
    tree: tree,
    multiple: false,
    allowCancel: true,
    loop,
    pageSize: 20,
    ...(initialSelection && {initialSelection}),
  }, { signal });
}

/**
 * Asks the user to select items from a tree structure using a REPL interface.
 */
export async function askForMultipleTreeSelection({
                                                    message,
                                                    tree,
                                                    initialSelection,
                                                    loop = false
                                                  }: AskForMultipleTreeSelectionOptions, signal: AbortSignal): Promise<string[] | null> {
  return await treeSelector({
    message: message ?? "",
    tree: tree,
    multiple: true,
    allowCancel: true,
    loop,
    pageSize: 20,
    ...(initialSelection && {initialSelection: Array.from(initialSelection)}),
  }, { signal });
}




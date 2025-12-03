import {confirm, editor, password} from "@inquirer/prompts";
import {HumanInterfaceRequestFor} from "@tokenring-ai/agent/HumanInterfaceRequest";
import commandPrompt from "@tokenring-ai/inquirer-command-prompt";
import {treeSelector} from "@tokenring-ai/inquirer-tree-selector";
import chalk from "chalk";
import open from "open";

export const CancellationToken = Symbol("CancellationToken");
export const ExitToken = Symbol("ExitToken");

export async function askForCommand(options: {
  autoCompletion?: string[],
  history?: string[]
}, signal: AbortSignal): Promise<string | typeof ExitToken | typeof CancellationToken> {
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

export async function askForConfirmation(options: HumanInterfaceRequestFor<"askForConfirmation">, signal: AbortSignal) {
  if (options.timeout && options.timeout > 0) {
    return Promise.race([
      confirm(options, {signal}),
      new Promise<boolean>(resolve => setTimeout(() => resolve(options.default ?? false), options.timeout! * 1000))
    ]);
  }
  return confirm(options, {signal});
}

export async function askForPassword(options: HumanInterfaceRequestFor<"askForPassword">, signal: AbortSignal) {
  return password(options, {signal});
}

export async function openWebPage({url}: HumanInterfaceRequestFor<"openWebPage">): Promise<boolean> {
  await open(url);
  return true;
}
/**
 * Asks the user a question and allows them to type in a multi-line answer using a REPL interface.
 */
export async function askForText(options: HumanInterfaceRequestFor<"askForText">, signal: AbortSignal): Promise<string> {
  return editor(options, {signal});
}

/**
 * Asks the user to select items from a tree structure using a REPL interface.
 */
export async function askForSingleTreeSelection({
                                                  message,
                                                  tree,
                                                  initialSelection,
                                                  loop = false
                                                }: HumanInterfaceRequestFor<"askForSingleTreeSelection">, signal: AbortSignal): Promise<string | null> {
  return await treeSelector({
    message: message ?? "",
    tree: tree,
    multiple: false,
    allowCancel: true,
    loop,
    pageSize: 20,
    ...(initialSelection && {initialSelection}),
  }, {signal});
}

/**
 * Asks the user to select items from a tree structure using a REPL interface.
 */
export async function askForMultipleTreeSelection({
                                                    message,
                                                    tree,
                                                    initialSelection,
                                                    loop = false
                                                  }: HumanInterfaceRequestFor<"askForMultipleTreeSelection">, signal: AbortSignal): Promise<string[] | null> {
  return await treeSelector({
    message: message ?? "",
    tree: tree,
    multiple: true,
    allowCancel: true,
    loop,
    pageSize: 20,
    ...(initialSelection && {initialSelection: Array.from(initialSelection)}),
  }, {signal});
}




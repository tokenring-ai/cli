import {confirm} from "@inquirer/prompts";
import {HumanInterfaceService} from "@token-ring/chat";
import type {TreeLeaf} from "@token-ring/chat/HumanInterfaceService";
import {treeSelector} from "@token-ring/inquirer-tree-selector";
import inquirer from "inquirer";
import open from "open";

export default class ReplHumanInterfaceService extends HumanInterfaceService {
  name: string = "ReplHumanInterfaceService";
  description: string =
    "Provides a REPL interface for asking the user for a selection from a list of items.";

  async askForConfirmation({
                             message,
                             default: defaultValue,
                           }: {
    message: string;
    default: boolean;
  }): Promise<boolean> {
    return confirm({
      message,
      default: defaultValue,
    });
  }

  async openWebBrowser(url: string): Promise<void> {
    await open(url);
  }

  /**
   * Asks the user to select an item from a list using a REPL interface.
   */
  async askForSelection({
                          title,
                          items,
                        }: {
    title: string;
    items: string[];
  }): Promise<string> {
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
  async ask(question: string): Promise<string> {
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
  async askForMultipleSelections({
                                   title,
                                   items,
                                   message,
                                 }: {
    title: string;
    items: string[];
    message?: string;
  }): Promise<string[]> {
    const {selections} = await inquirer.prompt<{ selections: string[] }>([
      {
        type: "checkbox",
        name: "selections",
        message: message || title,
        choices: items,
        loop: false,
      },
    ]);

    return selections;
  }

  /**
   * Asks the user to select items from a tree structure using a REPL interface.
   */
  async askForSingleTreeSelection({
                                    message,
                                    tree,
                                    initialSelection,
                                    loop = false,
                                  }: {
    message?: string;
    tree: TreeLeaf;
    initialSelection?: string | Array<string>;
    loop?: boolean;
  }): Promise<string | null> {
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
  async askForMultipleTreeSelection({
                                      message,
                                      tree,
                                      initialSelection,
                                      loop = false,
                                    }: {
    message?: string;
    tree: TreeLeaf;
    initialSelection?: string | Array<string>;
    loop?: boolean;
  }): Promise<string[] | null> {
    return await treeSelector({
      message: message ?? "",
      tree: tree,
      multiple: true,
      allowCancel: true,
      loop,
      pageSize: 20,
      ...(initialSelection && {initialSelection}),
    });
  }
}

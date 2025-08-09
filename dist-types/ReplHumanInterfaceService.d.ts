/**
 * @typedef {import('@token-ring/chat').HumanInterfaceService} HumanInterfaceService
 */
/**
 * REPL implementation of the HumanInterfaceService for terminal-based interactions
 * @extends {HumanInterfaceService}
 */
export default class ReplHumanInterfaceService extends HumanInterfaceService {
    askForConfirmation({ message, default: defaultValue }: {
        message: any;
        default: any;
    }): Promise<boolean>;
    openWebBrowser(url: any): Promise<void>;
    /**
     * Asks the user a question and allows them to type in a multi-line answer using a REPL interface.
     * @param {string} question - The question to ask the user.
     * @returns {Promise<string>} The user's answer.
     */
    ask(question: string): Promise<string>;
    /**
     * Asks the user to select items from a tree structure using a REPL interface.
     * @param {Object} options - The options for the tree selection.
     * @param {string} [options.message] - The message to display to the user.
     * @param {Function|Array<Object>} options.tree - Tree data structure or function that returns tree data.
     * @param {boolean} [options.multiple=false] - Whether to allow multiple selections.
     * @param {boolean} [options.allowCancel=true] - Whether to allow canceling the selection.
     * @param {string|Array<string>} [options.initialSelection] - Initial selection of items.
     * @param {boolean} [options.loop=false] - Whether to loop through choices when reaching the end.
     * @returns {Promise<Object|Array<Object>>} The selected item(s).
     */
    askForTreeSelection({ message, tree, multiple, allowCancel, initialSelection, loop, }: {
        message?: string;
        tree: Function | Array<any>;
        multiple?: boolean;
        allowCancel?: boolean;
        initialSelection?: string | Array<string>;
        loop?: boolean;
    }): Promise<any | Array<any>>;
}
export type HumanInterfaceService = import("@token-ring/chat").HumanInterfaceService;
import { HumanInterfaceService } from "@token-ring/chat";

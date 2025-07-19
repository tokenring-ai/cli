import {HumanInterfaceService} from "@token-ring/chat";
import { treeSelector } from 'inquirer-tree-selector';

export default class ReplHumanInterfaceService extends HumanInterfaceService {
 /**
  * The name of the service
  * @type {string}
  */
 name = 'ReplHumanInterfaceService';

 /**
  * Description of the service's functionality
  * @type {string}
  */
 description = 'Provides a REPL interface for asking the user for a selection from a list of items.';

 /**
  * Asks the user to select an item from a list using a REPL interface.
  * @param {object} options - The options for the selection.
  * @param {string} options.title - The title of the selection prompt.
  * @param {Array<string>} options.items - The items to choose from.
  * @returns {Promise<string>} The selected item.
  */
 async askForSelection({title, items}) {
  const {selection} = await inquirer.prompt([
   {
    type: 'list',
    name: 'selection',
    message: title,
    choices: items,
    loop: false, // Prevents looping through choices when reaching the end
   },
  ]);

  return selection;
 }

 /**
  * Asks the user a question and allows them to type in a multi-line answer using a REPL interface.
  * @param {string} question - The question to ask the user.
  * @returns {Promise<string>} The user's answer.
  */
 async ask(question) {
  const {answer} = await inquirer.prompt([
   {
    type: 'editor',
    name: 'answer',
    message: question,
    waitUserInput: true, // Wait for user to save and exit editor
   },
  ]);
  return answer;
 }

 /**
  * Asks the user to select multiple items from a list using a REPL interface.
  * @param {object} options - The options for the selection.
  * @param {string} options.title - The title of the selection prompt (used as message if no explicit message).
  * @param {Array<string>} options.items - The items to choose from.
  * @param {string} [options.message] - An optional message to display above the items.
  * @returns {Promise<Array<string>>} A promise that resolves to an array of selected items.
  */
 async askForMultipleSelections({title, items, message}) {
  const {selections} = await inquirer.prompt([
   {
    type: 'checkbox',
    name: 'selections',
    message: message || title,
    choices: items,
    loop: false, // Standard for checkbox prompts
    // `pageSize` could be added if lists are very long
   },
  ]);

  return selections;
 }

 /**
  * Asks the user to select items from a tree structure using a REPL interface.
  * @param {object} options - The options for the tree selection.
  * @param {string} [options.message] - The message to display to the user.
  * @param {Function|Array} options.tree - Tree data structure or function that returns tree data.
  * @param {boolean} [options.multiple=false] - Whether to allow multiple selections.
  * @param {boolean} [options.allowCancel=true] - Whether to allow canceling the selection.
  * @param {string|Array<string>} [options.initialSelection] - Initial selection of items.
  * @param {boolean} [options.loop=false] - Whether to loop through choices when reaching the end.
  * @returns {Promise<Object|Array<Object>>} The selected item(s).
  */
 async askForTreeSelection({message, tree, multiple = false, allowCancel = true, initialSelection, loop = false}) {
  return await treeSelector({
   message,
   tree,
   multiple,
   allowCancel,
   loop,
   pageSize: 20,
   ...(initialSelection && {initialSelection})
  });
 }
}
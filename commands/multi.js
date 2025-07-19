import {editor} from '@inquirer/prompts';
import REPLService from '../REPLService.js';

export const description = 'Opens an editor for multiline input. The entered text will be processed as the next input to the AI.';

export async function execute(args, registry) {
 const replService = registry.requireFirstServiceByType(REPLService);

 const prompt = await editor({
  message: 'Enter your multiline text (save and close editor to submit):',
  waitForUseInput: false,
 });

 if (prompt) {
  replService.injectPrompt(prompt);
 }
}


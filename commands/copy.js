import { ChatMessageStorage } from "@token-ring/ai-client";
import ChatService from "@token-ring/chat/ChatService";
import clipboardy from "clipboardy";

/**
 * Command description for help display
 * @type {string}
 */
export const description =
	"/copy - Copy the last assistant message to the clipboard.";

/**
 * Executes the copy command to copy the last assistant message to clipboard
 * @param {string} remainder - Any remaining text after the command (unused)
 * @param {import('@token-ring/registry').Registry} registry - The service registry
 * @returns {Promise<void>}
 */
export async function execute(_remainder, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const chatMessageStorage =
		registry.requireFirstServiceByType(ChatMessageStorage);

	const currentMessage = chatMessageStorage.getCurrentMessage();
	if (
		!currentMessage ||
		!currentMessage.response ||
		!currentMessage.response.message
	) {
		chatService.errorLine("No assistant message to copy.");
		return;
	}

	const textToCopy =
		currentMessage.response.message.content || currentMessage.response.message;

	try {
		await clipboardy.write(textToCopy);
		chatService.systemLine("Last assistant message copied to clipboard.");
	} catch (err) {
		chatService.errorLine(`Failed to copy to clipboard: ${err.message || err}`);
	}
}

/**
 * Returns help information for the copy command
 * @returns {Array<string>} Help text for the command
 */
export function help() {
	return ["/copy - Copy the last assistant message to the clipboard"];
}

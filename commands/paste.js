import ChatService from "@token-ring/chat/ChatService";
import clipboardy from "clipboardy";

/**
 * Command description for help display
 * @type {string}
 */
export const description =
	"/paste - Paste text from the clipboard into the chat.";

/**
 * Executes the paste command to read and display clipboard content
 * @param {string} remainder - Any remaining text after the command (unused)
 * @param {import('@token-ring/registry').Registry} registry - The service registry
 * @returns {Promise<void>}
 */
export async function execute(remainder, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);

	try {
		const text = await clipboardy.read();
		if (!text) {
			chatService.errorLine("Clipboard is empty.");
			return;
		}

		// For simplicity, just output the pasted text as a system line
		chatService.systemLine("Pasted text from clipboard:");
		chatService.systemLine(text);
	} catch (err) {
		chatService.errorLine(
			"Failed to read from clipboard: " + (err.message || err),
		);
	}
}

/**
 * Returns help information for the paste command
 * @returns {Array<string>} Help text for the command
 */
export function help() {
	return ["/paste - Paste text from the clipboard into the chat."];
}

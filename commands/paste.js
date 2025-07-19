import ChatService from "@token-ring/chat/ChatService";
import clipboardy from "clipboardy";

export const description =
	"/paste - Paste text from the clipboard into the chat.";

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

export function help() {
	return ["/paste - Paste text from the clipboard into the chat."];
}

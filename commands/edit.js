import ChatService from "@token-ring/chat/ChatService";
import { execa } from "execa";
import os from "os";
import fs from "fs/promises";
import path from "path";

// Helper to get default editor
function getDefaultEditor() {
	return (
		process.env.EDITOR || (process.platform === "win32" ? "notepad" : "vi")
	);
}

export const description = "/edit - Open your editor to write a prompt.";

export async function execute(remainder, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);

	// Create a temp file for editing
	const tmpFile = path.join(os.tmpdir(), `aider_edit_${Date.now()}.txt`);
	await fs.writeFile(tmpFile, remainder || "", "utf8");

	const editor = getDefaultEditor();

	try {
		await execa(editor, [tmpFile], {
			stdio: "inherit",
		});
	} catch (error) {
		// execa throws an error for non-zero exit codes or if the command fails to spawn
		chatService.errorLine(
			`Editor process failed: ${error.shortMessage || error.message}`,
		);
		// Clean up the temporary file in case of editor error
		try {
			await fs.unlink(tmpFile);
		} catch (e) {
			/* ignore cleanup error */
		}
		return; // Stop further execution
	}

	// Read the edited content
	const editedContent = await fs.readFile(tmpFile, "utf8");

	// Output the edited content as a system line
	chatService.systemLine("Edited prompt:");
	chatService.systemLine(editedContent);

	// Optionally: you can submit the edited content as a chat prompt here
}

export function help(chatService) {
	return [
		"/edit - Open your editor to write a prompt.",
		"  - With no arguments: Opens editor with blank prompt",
		"  - With text: Opens editor with provided text as starting point",
	];
}

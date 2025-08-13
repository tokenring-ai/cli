import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ChatService from "@token-ring/chat/ChatService";
import {execa} from "execa";
import type {Registry} from "@token-ring/registry";

function getDefaultEditor(): string {
	return process.env.EDITOR || (process.platform === "win32" ? "notepad" : "vi");
}

// Command description for help display
export const description: string = "/edit - Open your editor to write a prompt.";

/**
 * Executes the edit command to open an editor for prompt creation
 * @param remainder Initial text to populate the editor with
 * @param registry The service registry
 */
export async function execute(remainder: string, registry: Registry): Promise<void> {
	const chatService = registry.requireFirstServiceByType(ChatService);

	// Create a temp file for editing
	const tmpFile = path.join(os.tmpdir(), `aider_edit_${Date.now()}.txt`);
	await fs.writeFile(tmpFile, remainder || "", "utf8");

	const editor = getDefaultEditor();

	try {
		await execa(editor, [tmpFile], { stdio: "inherit" });
	} catch (error: unknown) {
		const err = error as { shortMessage?: string; message?: string };
		chatService.errorLine(`Editor process failed: ${err.shortMessage || err.message}`);
		try {
			await fs.unlink(tmpFile);
		} catch {
			/* ignore cleanup error */
		}
		return;
	}

	// Read the edited content
	const editedContent = await fs.readFile(tmpFile, "utf8");

	// Output the edited content as a system line
	chatService.systemLine("Edited prompt:");
	chatService.systemLine(editedContent);

	// Clean up the temporary file
	try {
		await fs.unlink(tmpFile);
	} catch {
		/* ignore cleanup error */
	}
}

/**
 * Returns help information for the edit command
 */
export function help(): Array<string> {
	return [
		"/edit - Open your editor to write a prompt.",
		"  - With no arguments: Opens editor with blank prompt",
		"  - With text: Opens editor with provided text as starting point",
	];
}

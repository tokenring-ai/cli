import ChatService from "@token-ring/chat/ChatService";
import type {Registry} from "@token-ring/registry";
import clipboardy from "clipboardy";

// Command description for help display
export const description: string =
  "/paste - Paste text from the clipboard into the chat.";

/**
 * Executes the paste command to read and display clipboard content
 * @param _remainder Any remaining text after the command (unused)
 * @param registry The service registry
 */
export async function execute(
  _remainder: string,
  registry: Registry,
): Promise<void> {
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
  } catch (err: unknown) {
    const e = err as { message?: string };
    chatService.errorLine(`Failed to read from clipboard: ${e?.message || err}`);
  }
}

/**
 * Returns help information for the paste command
 */
export function help(): Array<string> {
  return ["/paste - Paste text from the clipboard into the chat."];
}

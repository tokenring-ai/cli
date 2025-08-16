import {ChatMessageStorage} from "@token-ring/ai-client";
import ChatService from "@token-ring/chat/ChatService";
import type {Registry} from "@token-ring/registry";
import clipboardy from "clipboardy";

// Command description for help display
export const description: string =
  "/copy - Copy the last assistant message to the clipboard.";

/**
 * Executes the copy command to copy the last assistant message to clipboard
 * @param _remainder Any remaining text after the command (unused)
 * @param registry The service registry
 */
export async function execute(
  _remainder: string,
  registry: Registry,
): Promise<void> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const chatMessageStorage = registry.requireFirstServiceByType<ChatMessageStorage>(
    ChatMessageStorage,
  );

  const currentMessage = chatMessageStorage.getCurrentMessage?.();
  if (!currentMessage || !currentMessage.response || !currentMessage.response.message) {
    chatService.errorLine("No assistant message to copy.");
    return;
  }

  const textToCopy: string =
    currentMessage.response.message.content || currentMessage.response.message;

  try {
    clipboardy.writeSync(textToCopy);
    chatService.systemLine("Last assistant message copied to clipboard.");
  } catch (err: unknown) {
    const e = err as { message?: string };
    chatService.errorLine(`Failed to copy to clipboard: ${e?.message || err}`);
  }
}

/**
 * Returns help information for the copy command
 */
export function help(): Array<string> {
  return ["/copy - Copy the last assistant message to the clipboard"];
}

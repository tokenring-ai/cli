import ChatService from "@token-ring/chat/ChatService";
import clipboardy from "clipboardy";
import {ChatMessageStorage} from "@token-ring/ai-client";


  export const description = "/copy - Copy the last assistant message to the clipboard.";

  export async function execute(remainder, registry) {
    const chatService = registry.requireFirstServiceByType(ChatService);
    const chatMessageStorage = registry.requireFirstServiceByType(ChatMessageStorage);

    const currentMessage = chatMessageStorage.getCurrentMessage();
    if (!currentMessage || !currentMessage.response || !currentMessage.response.message) {
      chatService.errorLine("No assistant message to copy.");
      return;
    }

    const textToCopy = currentMessage.response.message.content || currentMessage.response.message;

    try {
      await clipboardy.write(textToCopy);
      chatService.systemLine("Last assistant message copied to clipboard.");
    } catch (err) {
      chatService.errorLine("Failed to copy to clipboard: " + (err.message || err));
    }
  }

export function help() {
 return [
  "/copy - Copy the last assistant message to the clipboard"
 ];
}

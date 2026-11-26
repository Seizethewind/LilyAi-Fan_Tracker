import { RouterError } from "../dist/ai_chat/chat_types.js";

export class ChatErrorLike extends RouterError {
  constructor(message, retryAfter) {
    super(message, retryAfter);
  }
}

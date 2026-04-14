const input = $json ?? {};
const message = input.message ?? {};
const callback = input.callback_query ?? null;
const callbackData = callback?.data ? String(callback.data) : '';
const messageText = typeof message.text === 'string' ? message.text : '';
const callbackText = typeof callback?.message?.text === 'string' ? callback.message.text : '';
const text = messageText || callbackText || '';
const chatIdRaw = message.chat?.id ?? callback?.message?.chat?.id ?? '';
const userIdRaw = message.from?.id ?? callback?.from?.id ?? '';
const messageIdRaw = message.message_id ?? callback?.message?.message_id ?? callback?.id ?? '';
const startMatch = text.match(/^\/start(?:\s+(.+))?$/);
const deepLink = startMatch?.[1] ? String(startMatch[1]).trim() : null;
let eventType = 'text_message';
if (callback) {
  eventType = 'callback_action';
} else if (startMatch) {
  eventType = deepLink ? 'deep_link_start' : 'start_reset';
}
return [{
  json: {
    event: {
      event_type: eventType,
      text,
      chatId: String(chatIdRaw || ''),
      chat_id: String(chatIdRaw || ''),
      userId: String(userIdRaw || ''),
      messageId: String(messageIdRaw || ''),
      timestamp: Date.now(),
      callback_query: callbackData ? { data: callbackData } : null,
      deep_link: deepLink,
    },
  },
}];
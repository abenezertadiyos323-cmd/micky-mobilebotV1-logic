const fs = require('fs');

const file = 'live_workflow.json';
const wStr = fs.readFileSync(file, 'utf8');
const w = JSON.parse(wStr);

const tgSend = w.nodes.find(n => n.name === 'Telegram Send');
if (!tgSend) throw new Error('Telegram Send not found');

// 1. Fix chatId to fallback to Event Normalizer
tgSend.parameters.chatId = "={{ $json.chat_id || $('Event Normalizer').first().json.event.chat_id }}";

// 2. Fix message text field mapping and add safe fallback
tgSend.parameters.text = "={{ $json.reply_text || 'Sorry, something went wrong. Please try again.' }}";

// 3. Remove parse_mode to prevent HTML unescaped character crashes
delete tgSend.parameters.parse_mode;

fs.writeFileSync(file, JSON.stringify(w, null, 2));

console.log("Locally patched Telegram Send for push");

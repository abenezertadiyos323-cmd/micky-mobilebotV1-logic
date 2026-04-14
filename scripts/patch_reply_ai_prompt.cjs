const fs = require("fs");

const workflowPath = "workflow.json";
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const node = workflow.nodes.find((item) => item.name === "Reply AI");

if (!node) {
  throw new Error("Reply AI node not found");
}

const prompt = [
  "You are Pass 2 Reply AI for the TedyTech Telegram bot.",
  "Return ONLY one valid JSON object with exactly this shape: {\"reply_text\":\"string\"}.",
  "Do not add any other keys. Do not explain anything. Do not add markdown fences.",
  "Use only the provided customer_text, understanding_output, rules_output, resolver_output, reply_context, last_messages, and client_config.",
  "Never invent stock, price, warranty, availability, delivery, location, or shop facts.",
  "Keep the reply to max 3 short lines.",
  "Default to natural Amharic in Ethiopic script for conversation.",
  "Use English only for brand, model, storage, and product names where natural.",
  "Do not produce awkward English-Amharic transliteration.",
  "Do not use vague words like technology, electronics, gadgets, or accessories unless the customer explicitly asks for them.",
  "Prefer wording around phone, mobile, model, exchange, shop, price, and availability.",
  "One emoji max, and only when the tone is playful.",
  "Strict continuity rules:",
  "- If reply_context.should_greet is false, never greet, never welcome, and never reopen with a seller introduction.",
  "- Only greet on explicit restart or the first meaningful turn of a new conversation.",
  "- If reply_context.has_active_context is true, continue that context instead of asking a generic buying-or-exchange question.",
  "- If the user message is clear, respond to that exact message and do not replace it with a generic opening.",
  "- If current_flow or current_topic exists, use it to continue the thread.",
  "Strict reply mode rules:",
  "- acknowledge_and_close: short close only, no question, no greeting.",
  "- off_topic_redirect: short redirect only, one gentle question max, no greeting.",
  "- small_talk_redirect: short natural acknowledgment plus one phone-related next step, no repeated welcome.",
  "- clarify_reference: ask which one the customer means, no product facts, no generic reopening.",
  "- resume_previous_flow: continue the previous thread directly, no restart behavior.",
  "- business_resolve: use resolver facts only. If resolver facts are weak, ask one narrow follow-up tied to the actual customer text or current context.",
  "- handoff_admin: brief reassurance only, no question, no greeting.",
  "Narrow clarification rules:",
  "- Do not ask buying-or-exchange unless intent is truly unclear and there is no useful session context.",
  "- If the customer asked about price, ask a narrow follow-up about the model or brand if needed.",
  "- If the customer asked available?, use the current item or current flow if present; do not reopen from zero.",
  "- If the customer said that one or cheaper one, stay in reference clarification or prior-context continuation; do not reopen with a catalog greeting.",
  "Style rules:",
  "- Sound like a practical Ethiopian phone seller on Telegram.",
  "- Be short, direct, natural, and sales-aware.",
  "- No robotic assistant phrasing.",
  "- No broad onboarding copy unless this is truly a new conversation.",
  "Output JSON only.",
].join("\\n");

node.parameters.jsonBody = `={{ JSON.stringify({
  model: 'google/gemini-3.1-flash-lite-preview',
  temperature: 0.15,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: ${JSON.stringify(prompt)} },
    {
      role: 'user',
      content: JSON.stringify({
        customer_text: $json.event?.text ?? '',
        understanding_output: $json.understanding_output ?? null,
        rules_output: $json.rules_output ?? null,
        resolver_output: $json.resolver_output ?? null,
        reply_context: {
          event_type: $json.event?.event_type ?? null,
          current_topic: $json.session?.conversation_state?.current_topic ?? null,
          current_flow: $json.session?.conversation_state?.current_flow ?? null,
          is_active: $json.session?.conversation_state?.is_active ?? true,
          message_count: Number($json.session?.message_count ?? 0),
          history_count: Array.isArray($json.session?.conversation_history) ? $json.session.conversation_history.length : 0,
          has_active_context: Boolean(
            ($json.session?.conversation_state?.current_flow ?? null)
            || ($json.session?.conversation_state?.current_topic ?? null)
            || (Array.isArray($json.session?.conversation_history) && $json.session.conversation_history.length > 0)
            || (Array.isArray($json.session?.flow_context?.buy_flow?.shown_products) && $json.session.flow_context.buy_flow.shown_products.length > 0)
            || $json.session?.flow_context?.buy_flow?.current_interest
          ),
          should_greet: Boolean(
            ($json.event?.event_type === 'start_reset')
            || (
              Number($json.session?.message_count ?? 0) === 0
              && (!Array.isArray($json.session?.conversation_history) || $json.session.conversation_history.length === 0)
              && !$json.session?.conversation_state?.current_flow
              && !$json.session?.conversation_state?.current_topic
            )
          ),
        },
        last_messages: Array.isArray($json.session?.conversation_history) ? $json.session.conversation_history.slice(-3) : [],
        client_config: $json.client_config ?? null,
      }),
    },
  ],
}) }}`;

fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + "\n");
console.log("reply ai prompt patched");

import json, uuid
path = 'workflow.json'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
for node in data['nodes']:
    if node.get('id') == 'telegram-send':
        node['parameters']['replyMarkup'] = "={{ $item(0).$node['Validation'].json.resolver_output?.result_type === 'exchange_offer' ? { inline_keyboard: [ [ { text: 'Confirm Exchange', callback_data: 'confirm_exchange' }, { text: 'Cancel', callback_data: 'cancel_exchange' } ] ] } : null }}"
        break
else:
    raise SystemExit('telegram-send node not found')
ids = {n['id'] for n in data['nodes']}
if 'callback-action-if' not in ids:
    data['nodes'].extend([
        {
            'parameters': {
                'conditions': {
                    'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict', 'version': 2},
                    'conditions': [
                        { 'id': str(uuid.uuid4()), 'leftValue': "={{ $json.event?.event_type === 'callback_action' }}", 'rightValue': True, 'operator': {'type':'boolean','operation':'true','singleValue':True}}],
                    'combinator': 'and'
                },
                'options': {'ignoreCase': False}
            },
            'id': 'callback-action-if',
            'name': 'Callback Action?',
            'type': 'n8n-nodes-base.if',
            'typeVersion': 2.2,
            'position': [1400,300]
        },
        {
            'parameters': {
                'jsCode': "const event = $json.event && typeof $json.event === 'object' ? $json.event : {};\nconst session = $json.session && typeof $json.session === 'object' ? $json.session : {};\nconst callbackData = String(event.callback_query?.data ?? '').trim();\nconst reply_text = callbackData === 'confirm_exchange'\n  ? 'Exchange confirmed. Admin has been notified and we will follow up with the details.'\n  : callbackData === 'cancel_exchange'\n  ? 'Exchange canceled. Let me know if you want another option.'\n  : 'I did not recognize that action. Please try again.';\nconst updatedSession = {\n  ...session,\n  last_message_at: Date.now(),\n  message_count: Math.max(0, Number(session.message_count ?? 0)) + 1,\n  admin_escalation: callbackData === 'confirm_exchange'\n    ? { required: true, reason: 'exchange_confirmed', status: 'pending' }\n    : (session.admin_escalation && typeof session.admin_escalation === 'object' ? session.admin_escalation : { required: false, reason: null, status: null }),\n  exchange_details: {\n    ...(session.exchange_details || {}),\n    last_callback_action: callbackData,\n    confirmed_at: callbackData === 'confirm_exchange' ? Date.now() : (session.exchange_details?.confirmed_at ?? null),\n    current_interest: session.flow_context?.buy_flow?.current_interest ?? null,\n  },\n};\nreturn [{\n  json: {\n    event,\n    session,\n    callbackData,\n    reply_text,\n    telegram_payload: { chat_id: event.chatId ?? null, text: reply_text },\n    session_update_payload: { userId: event.userId ?? null, chatId: event.chatId ?? null, session: updatedSession },\n    admin_notification_payload: callbackData === 'confirm_exchange'\n      ? { customer_id: session.customer_id ?? event.userId ?? null, chat_id: event.chatId ?? null, action: 'confirm_exchange', exchange_details: updatedSession.exchange_details }\n      : null,\n  },\n}];"
            },
            'id': 'callback-action-handler',
            'name': 'Callback Action Handler',
            'type': 'n8n-nodes-base.code',
            'typeVersion': 2,
            'position': [1600,520]
        },
        {
            'parameters': {
                'chatId': "={{ $json.telegram_payload.chat_id }}",
                'text': "={{ $json.reply_text }}",
                'additionalFields': {'appendAttribution': False}
            },
            'id': 'callback-telegram-send',
            'name': 'Callback Telegram Send',
            'type': 'n8n-nodes-base.telegram',
            'typeVersion': 1.2,
            'credentials': {'telegramApi': {'id': 'lFnI6XXhGbOZJr8X', 'name': 'Telegram account'}},
            'position': [3440,520]
        },
        {
            'parameters': {
                'method': 'POST',
                'url': "={{(() => { const base = $env.CONVEX_HTTP_BASE_URL || $env.CONVEX_URL || $env.NEXT_PUBLIC_CONVEX_URL; if (!base) { throw new Error('Missing Convex URL env: CONVEX_HTTP_BASE_URL or $env.CONVEX_URL || $env.NEXT_PUBLIC_CONVEX_URL'); } return String(base).replace(/\/$/, '').replace(/\.convex\.cloud(?=\/|$)/, '.convex.site'); })() + '/http/session-save'}}",
                'sendHeaders': True,
                'headerParameters': {'parameters': [{'name': 'Content-Type', 'value': 'application/json'}]},
                'sendBody': True,
                'specifyBody': 'json',
                'jsonBody': "={{ JSON.stringify($json.session_update_payload) }}",
                'options': {}
            },
            'id': 'callback-session-save',
            'name': 'Callback Session Save',
            'type': 'n8n-nodes-base.httpRequest',
            'typeVersion': 4.2,
            'position': [3680,520]
        }
    ])
connections = data.setdefault('connections', {})
connections['Session Bootstrap'] = {'main': [[{'node':'callback-action-if','type':'main','index':0}]]}
connections['Callback Action?'] = {'main': [[{'node':'callback-action-handler','type':'main','index':0}], [{'node':'Understanding AI','type':'main','index':0}]]}
connections['Callback Action Handler'] = {'main': [[{'node':'callback-telegram-send','type':'main','index':0}], [{'node':'callback-session-save','type':'main','index':0}]]}
connections['Callback Telegram Send'] = {'main': [[{'node':'callback-session-save','type':'main','index':0}]]}
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print('patched workflow.json')

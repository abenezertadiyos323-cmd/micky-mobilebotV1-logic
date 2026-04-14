import json

data = json.load(open('exec_636.json', 'r', encoding='utf-8'))
rd = data['data']['resultData']['runData']

# This run went through Set No-Resolver Output, not Product Search
# Trace the data through each node to find where chat_id is lost

def get_json(node_name):
    try:
        return rd[node_name][0]['data']['main'][0][0]['json']
    except:
        return None

print('=== Event Normalizer ===')
en = get_json('Event Normalizer')
if en:
    event = en.get('event', {})
    print('  chat_id:', event.get('chat_id'))
    print('  chatId:', event.get('chatId'))
    print('  userId:', event.get('userId'))

print('\n=== Session Bootstrap ===')
sb = get_json('Session Bootstrap')
if sb:
    event = sb.get('event', {})
    print('  event.chat_id:', event.get('chat_id'))
    print('  event.chatId:', event.get('chatId'))
    print('  client_config.store_address:', sb.get('client_config', {}).get('store_address'))

print('\n=== Set No-Resolver Output ===')
nro = get_json('Set No-Resolver Output')
if nro:
    print('  Keys:', list(nro.keys()))
    event = nro.get('event', {})
    print('  event.chat_id:', event.get('chat_id'))
    print('  event.chatId:', event.get('chatId'))
else:
    print('  Not found or no output')

print('\n=== Reply AI ===')
ra = get_json('Reply AI')
if ra:
    print('  Keys:', list(ra.keys()))
    choices = ra.get('choices', [{}])
    content = choices[0].get('message', {}).get('content', '')
    print('  reply_text content:', content[:200])
    event = ra.get('event', {})
    print('  event.chat_id:', event.get('chat_id') if isinstance(event, dict) else 'N/A')

print('\n=== Validation ===')
val = get_json('Validation')
if val:
    print('  Keys:', list(val.keys()))
    print('  chat_id:', val.get('chat_id'))
    print('  event:', json.dumps(val.get('event', {}))[:200])
    print('  telegram_payload:', json.dumps(val.get('telegram_payload', {}))[:200])
    print('  reply_text:', str(val.get('reply_text', ''))[:100])

print('\n=== Safe To Send ===')
sts = get_json('Safe To Send')
if sts:
    print('  Keys:', list(sts.keys()))
    print('  chat_id:', sts.get('chat_id'))
    print('  event.chat_id:', sts.get('event', {}).get('chat_id'))
    print('  reply_text:', str(sts.get('reply_text', ''))[:100])

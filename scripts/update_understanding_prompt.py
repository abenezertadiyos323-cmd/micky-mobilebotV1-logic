import json

# The new system prompt from the user
new_system_prompt = """You are a neutral, precise conversational function classifier for a Telegram sales bot.

Your ONLY job is to analyze the CURRENT customer message and return exactly one valid JSON object.

CRITICAL THINKING ORDER:
1. Understand the CURRENT message meaning by itself
2. Detect intention ONLY if it is clear
3. Check previous context ONLY if there is strong evidence (e.g. "that one", "128gb", "second one")
4. If no clear intention → ask clarification (do NOT guess)

IMPORTANT BEHAVIOR:
- Meaning first, intention second, structure last
- Never force intention
- Never rely on previous context without evidence
- If multiple possible meanings → clarification

AMHARIC / MIXED LANGUAGE:
- Fully support Amharic and mixed Amharic-English
- Focus on semantic meaning, not literal words
- Ignore spelling noise or informal phrasing

ALLOWED message_function:
- info_request
- refinement
- negotiation
- acknowledgment
- clarification
- fresh_request

DEFINITIONS:

info_request → asking about store info, location, delivery, warranty, payment, contact  
refinement → adding detail (128gb, black, second one, cheaper)  
negotiation → asking for discount / price reduction  
acknowledgment → greeting, thanks, simple reply  
clarification → meaning or intention unclear  
fresh_request → completely new request unrelated to previous context  

STRICT RULES:
- Never classify negotiation as acknowledgment
- Never default to fresh_request if message relates to previous context
- Only use previous context if there is clear reference
- If unsure → clarification with low confidence
- confidence and ambiguity must be between 0.0 and 1.0

OUTPUT FORMAT (STRICT):

Return EXACTLY this JSON and nothing else:

{
  "message_function": "info_request | refinement | negotiation | acknowledgment | clarification | fresh_request",
  "business_intent": "store_info | product_search | pricing | exchange | support | null",
  "topic": "store_info | product | exchange | pricing | location | null",
  "confidence": 0.0,
  "ambiguity": 0.0,
  "missing_information": [],
  "reference_resolution": {
    "refers_to": null,
    "resolved_id": null
  },
  "last_asked_key": null
}"""

def process():
    try:
        workflow_file = 'active_workflow_hc55q2zfas7gG1yu.json'
        with open(workflow_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error reading workflow:", e)
        return

    nodes = data.get('data', {}).get('nodes', []) or data.get('nodes', [])
    updated = False
    for node in nodes:
        if node['name'] == 'Understanding AI':
            json_body = node.get('parameters', {}).get('jsonBody', '')
            if json_body.startswith('={{ JSON.stringify({'):
                # We extract the JSON object inside the stringify
                inner_json_txt = json_body[len('={{ JSON.stringify('):-len(') }}')]
                # Note: This inner content is NOT valid JSON string, it's a JS object template
                # with things like $json.session...
                # We'll use regex to replace the system content
                import re
                # We look for the system role message content
                pattern = r"role: 'system', content: \".*?\""
                # We need to escape newlines for the JS string within the JSON.stringify
                escaped_prompt = new_system_prompt.replace('\n', '\\n').replace('"', '\\"')
                replacement = f"role: 'system', content: \"{escaped_prompt}\""
                new_inner = re.sub(pattern, replacement, inner_json_txt, flags=re.DOTALL)
                node['parameters']['jsonBody'] = f"={{ JSON.stringify({new_inner}) }}"
                updated = True
                print("Successfully updated Understanding AI system prompt.")

    if updated:
        with open(workflow_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    else:
        print("Could not find or update the node.")

process()

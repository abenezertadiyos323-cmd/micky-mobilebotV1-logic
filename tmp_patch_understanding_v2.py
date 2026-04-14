import json
import re

# ── 1. Load workflow ──────────────────────────────────────────────────────────
with open('workflow.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

# ── 2. Read PROMPT.md — content starts at line 7 (index 6) ───────────────────
with open('docs/abenier/understanding/PROMPT.md', 'r', encoding='utf-8') as f:
    all_lines = f.readlines()

# Skip header lines 1-6 (# title, ## Used In, etc.)
prompt_lines = all_lines[6:]

# Strip trailing blank lines
while prompt_lines and prompt_lines[-1].strip() == '':
    prompt_lines.pop()

prompt_text = ''.join(prompt_lines).rstrip('\n')

print("=== PROMPT first 100 chars ===")
print(repr(prompt_text[:100]))
print("=== PROMPT last  100 chars ===")
print(repr(prompt_text[-100:]))

# ── 3. Encode for JS double-quoted string embedding ───────────────────────────
# Order: backslashes first, then double-quotes, then newlines
js_prompt = prompt_text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

print("\n=== JS-encoded snippet (first 120 chars) ===")
print(repr(js_prompt[:120]))

# ── 4. Locate and patch the Understanding AI node ────────────────────────────
patched = False
for n in wf.get('nodes', []):
    if n.get('name') != 'Understanding AI':
        continue

    jb = n['parameters']['jsonBody']

    # Match: { role: 'system', content: "CONTENT" }
    # Uses (?:[^"\\]|\\.)*  to handle escaped chars inside the content
    pattern = r"(\{ role: 'system', content: \")((?:[^\"\\]|\\.)*)(\"[ \t]*\})"

    m = re.search(pattern, jb, re.DOTALL)
    if not m:
        print("ERROR: system content pattern not found!")
        print("First 600 chars of jsonBody:")
        print(repr(jb[:600]))
        break

    old_content = m.group(2)
    print("\n=== OLD system content (first 120 chars) ===")
    print(repr(old_content[:120]))
    print("=== OLD system content (last  120 chars) ===")
    print(repr(old_content[-120:]))

    # Build the new jsonBody with only the system content replaced
    new_jb = jb[:m.start(2)] + js_prompt + jb[m.end(2):]
    n['parameters']['jsonBody'] = new_jb

    print("\n=== NEW system content (first 120 chars) ===")
    print(repr(js_prompt[:120]))
    print("=== NEW system content (last  120 chars) ===")
    print(repr(js_prompt[-120:]))

    patched = True
    break

if not patched:
    raise RuntimeError("Patch failed — 'Understanding AI' node not updated.")

# ── 5. Validate other fields unchanged ───────────────────────────────────────
for n in wf.get('nodes', []):
    if n.get('name') == 'Understanding AI':
        jb = n['parameters']['jsonBody']
        assert "google/gemini-3.1-flash-lite-preview" in jb, "model changed!"
        assert "temperature: 0" in jb,                      "temperature changed!"
        assert "json_object" in jb,                          "response_format changed!"
        assert "role: 'user'" in jb,                         "messages[1] missing!"
        print("\n✅ Validation passed: model, temperature, response_format, messages[1] all intact")
        break

# ── 6. Write back ─────────────────────────────────────────────────────────────
with open('workflow.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=False, indent=2)

print("✅ workflow.json written successfully")
print("✅ Only messages[0].content was changed")

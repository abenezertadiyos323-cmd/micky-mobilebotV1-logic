# Store-Info Presentation Plan
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**Mode:** Planning / Audit Only — No code changed

---

## 1. Best Layer to Own the Text

**Validation Node (Side-Effects Layer).**

Validation is the correct architectural layer for UI/UX instructions because:
1.  **Reliability:** Reply AI is a generative model and cannot be trusted to perfectly reproduce rigid UI instructions (like exactly where a Mini App button is located on the screen) turn after turn.
2.  **Current Blueprint:** Validation already handles appending the English `storeCtaText` and attaching the `storeMarkup` inline button across multiple branches (`store_info`, `visitIntent`, and product recommendations).
3.  **Separation of Concerns:** Business Data Resolver handles the raw data fact (the address string). Reply AI adds conversational tone. Validation adds the mechanical UI presentation layer.

---

## 2. Recommended Final Amharic Text

Based on your concept, the text needs to clearly separate the inline location button from the Telegram Mini App "Shop Now" button.

**Recommended Amharic CTA Text (`storeCtaText` replacement):**
```text
ወደ ሱቃችን ለመምጣት ከታች ያለውን 📍የአድራሻ በተን ይጠቀሙ።
ለተጨማሪ ስልኮች እና መለዋወጫዎች ኪቦርዱ አጠገብ ያለውን "Shop Now" ይጫኑ::
```
*(Translation: To come to our store, use the 📍 address button below. For more phones and accessories, press "Shop Now" near the keyboard.)*

This is native, clear, and perfectly matches the instructional logic required for Telegram UI.

---

## 3. Override or Append?

**Append.**

The presentation text should **append** to the grounded address text provided by the Business Data Resolver. 

**Why Appending is the clean architecture:**
*   **Business Data Resolver** outputs the fact: `"TedyTech store location:"`
*   **Reply AI** formats it conversationally (if needed).
*   **Validation** steps in at the very end and *appends* the UI instructions: `"ወደ ሱቃችን ለመምጣት..."`.

This ensures that if the physical address context changes in the database/resolver, you don't have to rewrite the UI instructions, and the bot still delivers the core fact.

---

## 4. Map Button Logic

**Stay Unchanged.**

The `storeMarkup` logic in Validation is already architecturally sound. It builds an `inlineKeyboard` with an `url` field.
```javascript
const storeMarkup = buildInlineKeyboard([
  [
    { text: '📍 Visit our store', additionalFields: { url: mapUrl } }, // (Minor update to the text label itself, but same logic)
  ],
]);
```
This correctly renders the button directly underneath the appended CTA text, which exactly matches the instruction "use the location button below".

---

## 5. Smallest Safe Implementation Plan

The fix requires editing only the **Validation** node configuration at the top where constants are defined.

**Step 1:** Update the `storeCtaText` constant to the new Amharic text.
```javascript
const storeCtaText = 'ወደ ሱቃችን ለመምጣት ከታች ያለውን 📍የአድራሻ በተን ይጠቀሙ።\nለተጨማሪ ስልኮች እና መለዋወጫዎች ኪቦርዱ አጠገብ ያለውን "Shop Now" ይጫኑ::';
```

**Step 2:** (Optional but recommended) Update the Inline Button text to match the new instruction, keeping the structure identical.
```javascript
const storeMarkup = buildInlineKeyboard([
  [
    { text: '📍 Visit our store', additionalFields: { url: mapUrl } },
  ],
]);
```

**Step 3:** Do not change the `else if` branches. Because `store_info` branch already executes `reply_text = reply_text + '\n' + storeCtaText`, the new Amharic text will automatically attach itself perfectly every time.

---

## 6. What Must NOT Be Touched

*   **Do NOT touch Understanding AI or Rules Layer:** The routing (`flow: info`, `store_info`) is currently working correctly. Do not alter how the bot identifies the user's intent to visit.
*   **Do NOT edit the Business Data Resolver logic:** The resolver returning `result_type: 'store_info'` is standard and correct. (You may update the `STORE_INFO` address string inside it to be whatever base text you want, but the logic stays).
*   **Do NOT add this text to the Reply AI prompt:** Generative models will mangle UI instructions and sometimes put the Mini App instructions in the wrong flow. Let Validation handle it deterministically.
*   **Do NOT change Validation branch order:** The `store_info` branch already cleanly intercepts and appends text. No structural changes are needed.

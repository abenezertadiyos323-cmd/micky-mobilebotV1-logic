# Buying Flow Post-Price Continuation & Exchange Handoff Plan
> **Scope:** ONLY the post-price continuation logic and its safe handoff into exchange collection.
> **Status:** Planning only — no code changes yet.
> **Date:** 2026-04-05

---

## 1. Locked Buying Flow — Clean Step-by-Step

This is the agreed behavior restated precisely for implementation reference.

```
Step 1 → Customer asks about a phone or price
Step 2 → Bot matches product from Convex, returns:
           - Phone name + price
           - Short useful summary (critical fields depending on brand type)
           - (No stop after price)

Step 3 → Post-price, bot continues with EXACTLY TWO directions:
           Option A: "More details" invitation
           Option B: Exchange-oriented invitation (dynamic wording, controlled variation)

Step 4A → If customer says "more details":
           - Bot reads saved product data from Convex
           - For iPhones: prioritize model → storage → battery_health, then remaining fields
           - For Samsung/Android: prioritize model → storage → RAM, then remaining fields
           - After answering details, bot naturally offers exchange path

Step 4B → If customer moves toward exchange:
           - Bot preserves target phone from prior buying context (DO NOT re-ask)
           - Bot begins collecting current phone critical fields one at a time
           - For iPhone as current phone: model → storage → battery_health
           - For Samsung/Android as current phone: model → storage → RAM
           - Skip any field already known from chat history

Step 5 → Reserve comes later, after stronger intent is confirmed
          Not the first post-price close action
```

---

## 2. Exact Node Groups Where Logic Must Be Edited

Based on full code audit of `tmp_nodes_dump.md` and core layer documentation:

### 2.1 — Business Data Resolver (PRIMARY TARGET — High Priority)
**File represented by:** `core/business_data_resolver.md` + live node "Business Data Resolver" in workflow.

**Why this is the primary target:**
The resolver currently returns `result_type = 'exchange_offer'` when `resolverInput.flow === 'exchange'` but does not return a post-price continuation payload. The `resolver_output` object currently has no concept of:
- `post_price_continuation` (the two strategic follow-up directions)
- `exchange_invitation_variant` (the wording variant slot)
- `detail_fields_ordered` (the priority-ordered list to present for more-details)
- `exchange_missing_fields` (tracking what is still needed from customer's current phone)

**Required additions to resolver_output:**
```
resolver_output.post_price_mode → "price_shown" | "details_shown" | null
resolver_output.exchange_invitation_variant → 1 | 2 | 3 | 4 (slot index for Reply AI)
resolver_output.product_detail_fields → ordered array of available field objects
resolver_output.exchange_collection → {
  target_phone: { brand, model, storage } | null  (from session buying context)
  current_phone_type: "iphone" | "android" | null
  collected: { model, storage, ram, battery_health, condition }
  next_missing_field: "model" | "storage" | "ram" | "battery_health" | null
}
```

### 2.2 — Reply AI Prompt (SECONDARY TARGET — Medium Priority)
**Live node:** "Reply AI" in workflow.

**Why this needs change:**
The Reply AI currently has no instruction for:
- What to do when `result_type === 'single_product'` and price has been shown
- How to render post-price continuation (text-led, not button-led)
- How to choose between the exchange invitation wording variants
- How to present ordered detail fields for more-detail requests
- Brand-type-aware prioritization (iPhone vs Android)

**Additions needed in the Reply AI system prompt:**
- Post-price continuation rules (two directions, text-led)
- Exchange wording variant selection logic (from controlled variant index)
- `product_detail_fields` rendering order rule
- iPhone vs Android detail priority rule

### 2.3 — Rules Layer (MINOR TOUCH — Low Priority)
**Live node:** "Rules Layer" in workflow.

**Why a small touch is needed:**
The `rules_output` currently routes `messageFunction === 'fresh_request'` with `businessIntent === 'exchange'` to `reply_mode: 'business_resolve'` with `flow = 'exchange'`.

However, there is no specific handling of the transition:
- **buy → further details** (same product, customer wants more info)
- **buy → exchange entry** (customer moves from price interest to exchange intent)

A minimal addition is needed:
```
post_price_context → {
  price_was_shown: boolean
  target_product_id: string | null
  target_product_brand_type: "iphone" | "android" | null
}
```
This must be computed from `session.flow_context.buy_flow.current_interest` and passed to the resolver.

**What must NOT be touched in Rules Layer:**
- `start_reset` path
- `acknowledgment` path
- `store_info` / `info` override path
- budget signal logic
- anchor mode logic
- All negotiation/refinement paths unrelated to buying continuation

### 2.4 — Session Schema / Convex (DATA DEPENDENCY — See Section 5)
No immediate changes to session normalization needed for MVP, but new fields will be READ from `exchange_details` in a more structured way.

---

## 3. What Must Remain Untouched

These nodes/sections must NOT be modified in this task:

| Node / Section | Reason |
|---|---|
| Event Normalizer | Pure transformation — no change needed |
| Session Bootstrap | Working correctly — no change needed |
| Understanding AI prompt | Scope locked — do not redesign |
| Understanding JSON Guard | Scope locked — schema validator |
| `start_reset` handling in Rules Layer | Working correctly — fragile |
| `acknowledgment` handling in Rules Layer | Separate concern |
| `store_info` / `info` override path | Separate, tested concern |
| `negotiation` path in Rules Layer | Unrelated to buying continuation |
| `support` path | Unrelated |
| FAQ flow | Unrelated |
| Greeting flow | Unrelated |
| Session Save node | No schema changes needed for MVP |
| Convex `sessions.ts` normalizer | No new schema fields for MVP |
| Telegram Send node | No change |
| Side Effects node | No change in this task |

---

## 4. Data Dependencies from Convex Product Records

### 4.1 — Currently Returned by product search (products.ts `searchBySeller`)
The current search query returns these fields per product:
```
_id, sellerId, brand, model, phoneType, price, stockQuantity,
storage, condition, exchangeEnabled, images
```

**What is notably MISSING from search results:**
- `ram` — NOT returned
- `battery_health` — NOT returned
- Any additional descriptive fields (color, processor, etc.)

### 4.2 — What More-Details Requires

For iPhone products, these are the critical MVP fields needed:
1. `model` ✅ (already returned)
2. `storage` ✅ (already returned)
3. `battery_health` ❌ **NOT RETURNED — see gap below**

For Samsung/Android products, these are the critical MVP fields needed:
1. `model` ✅ (already returned)
2. `storage` ✅ (already returned)
3. `ram` ❌ **NOT RETURNED — see gap below**

### 4.3 — What Must Be Added to Product Search Return

For the more-details flow to work correctly, the product search HTTP endpoint and/or the `searchBySeller` Convex function must be extended to return:
- `ram` field (from product record)
- `battery_health` field (from product record, may be null/missing)

**This is a Convex function change** in `convex/products.ts` — specifically in the `.map()` return at the end of `searchBySeller`.

---

## 5. Missing Fields & Schema / Data Gaps

### Gap 1 — iPhone Battery Health in Product Records
**Severity:** HIGH for iPhone MVP flow

- `battery_health` is stored in `exchange_details` for customer's current phone in the session schema.
- But for **product (target phone)** records in Convex, `battery_health` is NOT in the current search result map.
- Additionally, it is unknown whether all existing iPhone product records in the `products` table actually have `battery_health` stored as a field.

**Required action before implementation:**
> ⚠️ **DATA AUDIT NEEDED:** Manually check a sample of iPhone records in the `products` Convex table to determine if `battery_health` is populated, partially populated, or entirely absent.

**Safe fallback if absent from record:**
The bot should not fabricate battery health. If `battery_health` is `null` or missing from a product record, the more-details response should simply omit it gracefully and present the remaining available fields.

### Gap 2 — RAM Not in Product Search Return
**Severity:** HIGH for Samsung/Android MVP flow

- `ram` is not included in the `searchBySeller` return map.
- It may exist in the raw product document.

**Required action:** Extend `convex/products.ts searchBySeller` to include `ram` in the return map.

### Gap 3 — Exchange Collection Fields for Customer's Current Phone
**Severity:** MEDIUM — session schema already supports this, but the flow does not collect it intelligently.

The session `exchange_details` object already has these fields:
```
brand, model, storage, battery_health, ram, condition, expected_price_etb,
has_images, photo_count, details_complete
```

What is MISSING is the logic that:
- Determines which next field to ask for based on the BRAND TYPE of the customer's current phone
- Avoids asking fields already provided in recent chat history
- Sets the correct next_missing_field based on iPhone vs Android type

Currently `details_complete` is set but the logic for populating fields in priority order does not exist.

### Gap 4 — Brand Type Detection for Exchange Current Phone
The system currently detects brand/model from the customer message (in Rules Layer via `extractPhoneType`). However, once exchange flow starts, the bot needs to determine:
- Is the customer's current phone an iPhone? → ask battery_health as third field
- Is it Samsung/Android? → ask RAM as third field

This brand-type routing must be derived from the collected `exchange_details.brand` value in session.

---

## 6. Chat History Usage — Safe Rules

### 6.1 — Target Phone Preservation
When a customer has previously established a target phone through buying flow (price was shown, or product was in `shown_products` or `current_interest`), and then moves toward exchange:

```
Preserve: session.flow_context.buy_flow.current_interest
Use as: exchange_collection.target_phone (brand, model, storage)
Do NOT re-ask: "which phone do you want to buy?"
```

**Where this logic lives:** Business Data Resolver — the `exchange_context` object is already built from `session.flow_context.buy_flow.current_interest`. This just needs to be surfaced more explicitly in `post_price_mode`.

### 6.2 — Avoiding Duplicate Questions
When collecting current phone details in exchange flow:

**Check this before asking each field:**
```
session.exchange_details.brand        → skip if not null
session.exchange_details.model        → skip if not null
session.exchange_details.storage      → skip if not null
session.exchange_details.ram          → skip if not null (Android)
session.exchange_details.battery_health → skip if not null (iPhone)
```

**Also check:** `session.last_asked_key` — if the same field was just asked, do not ask it again.

### 6.3 — Adapting to Topic Changes
If the customer changes the target phone mid-conversation (says "actually, how much is the iPhone 15 Pro?"):
- Update `session.flow_context.buy_flow.current_interest` to new phone
- Clear old target phone from exchange context
- Do NOT preserve stale old target phone

**Detection trigger:** In Rules Layer or Resolver — if `currentTurnPhoneType` is NOT null AND does not match `currentInterest.model`, this is a new phone request. Treat as fresh buy turn, update `current_interest`.

This is already partially handled by the anchor mode logic in Rules Layer. No separate change needed; the resolver just needs to correctly expose this.

---

## 7. Controlled Wording Variation Strategy for Exchange Invitation

### Design Rule
The Reply AI **must NOT** freely generate exchange invitation sentences. It **must select** from a pre-assigned variant index provided by the resolver.

### Variant Pool (4 Variants for MVP)
The resolver will compute `exchange_invitation_variant` as an integer 1–4. The Reply AI must render the correct template (translated naturally to the customer's language).

| Variant | English Base | Notes |
|---|---|---|
| 1 | "If you tell me your current phone, I can tell you how much you may need to add." | Additive-cost framing |
| 2 | "Do you have a phone you'd like to exchange for this one?" | Direct question |
| 3 | "If you already have a phone, I can help estimate the add-on amount." | Estimation framing |
| 4 | "Want me to check how much extra you'd need if you exchange your current phone?" | Action framing |

### Variant Selection Rule (Deterministic, No AI Creativity)
The resolver must compute the variant using this rule to avoid the same variant every time:
```javascript
exchange_invitation_variant = (session.message_count % 4) + 1
```
This rotates through 1→2→3→4→1→... based on total session message count.
- Simple, deterministic, no randomness
- Produces natural variety over multiple conversations
- Avoids the AI selecting freely

### Important Constraint
Regardless of which variant is selected:
- The Reply AI renders the INTENT of the variant, not a literal translation
- It must adapt the wording naturally to the detected language (Amharic/English/mixed)
- The variant number is the controller, not a literal copy-paste

---

## 8. Safest Implementation Order

This is the recommended sequence before editing anything live:

### Phase 1 — Data Foundation (Convex)
**Do first — no-risk changes**

1. **Audit** iPhone product records in Convex `products` table:
   - Check if `battery_health` field exists and is populated
   - Check if `ram` field exists in product documents
   - Document what is present vs absent

2. **Extend `convex/products.ts searchBySeller`** to return:
   - `ram` field
   - `battery_health` field
   - Keep both nullable — do not break existing records

3. **Test** the Convex endpoint returns updated fields before touching n8n nodes.

---

### Phase 2 — Resolver Extension (Business Data Resolver)
**Second — isolated logic addition**

4. Add `post_price_context` computation in Business Data Resolver:
   - Detect if price was just shown (`result_type === 'single_product'` and product was returned)
   - Determine `brand_type` of target phone (`iphone` vs `android`)
   - Compute `exchange_invitation_variant` using `(session.message_count % 4) + 1`
   - Build ordered `product_detail_fields` array based on brand type

5. Add `exchange_collection` object in Business Data Resolver when flow is exchange:
   - Read `session.flow_context.buy_flow.current_interest` as target_phone
   - Read `session.exchange_details` for already-collected fields
   - Determine `next_missing_field` based on brand type priority
   - Determine `current_phone_brand_type` from `session.exchange_details.brand`

6. **Test** by running a price query and inspecting resolver_output in n8n debug.

---

### Phase 3 — Reply AI Prompt (Post-Price Instructions)
**Third — language layer update**

7. Add post-price continuation rules to Reply AI system prompt:
   - Rule: When `resolver_output.post_price_mode === 'price_shown'`, do NOT stop — continue with two options
   - Rule: Use `exchange_invitation_variant` to pick wording (do not invent freely)
   - Rule: Text-led only — no inline buttons at this stage
   - Rule: Present `product_detail_fields` in order when `reply_mode === 'details_request'`

8. Add exchange collection rules to Reply AI:
   - Rule: When `exchange_collection.next_missing_field` is set, ask ONLY that field
   - Rule: Use `exchange_collection.target_phone` to show context without re-asking
   - Rule: Brand-type-aware field labels (battery health for iPhone, RAM for Android)

9. **Test** with manual simulation in n8n before deploying.

---

### Phase 4 — Rules Layer Touch (Minimal)
**Last — most fragile layer**

10. Add `post_price_context` pass-through in Rules Layer `session_update`:
    - If current turn is a buying turn and product was recently shown, mark it
    - No routing changes needed here — just expose the context flag

11. Verify no existing paths are broken by running existing test cases.

---

### What to NOT Change at All in This Phase
- Understanding AI prompt → LOCKED
- Session Bootstrap → LOCKED
- Event Normalizer → LOCKED
- Any FAQ / store-info / support paths → LOCKED
- Reserve flow → LOCKED until post-price flow is stable

---

## 9. Summary: Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `battery_health` absent from iPhone product records | Graceful omit — never show null field to customer |
| Reply AI picking free exchange wording | Lock it to variant 1–4 index — no free generation |
| Bot re-asking target phone after price shown | Resolver must expose `target_phone` from `current_interest` |
| Anchor mode conflict with exchange entry | Check that `messageFunction === 'fresh_request'` + `businessIntent === 'exchange'` still routes correctly |
| Reply AI greeting on post-price continuation | `should_greet: false` is already guarded in Reply AI context — preserve this |
| Reserve being triggered too early | Reserve paths are not touched in this task |
| Existing FAQ/store-info breaking | None of those paths are touched |

---

## 10. Open Audit Items Before Editing

The following must be verified before any code changes begin:

- [ ] **Audit:** Do iPhone product records in Convex `products` table have `battery_health` stored?
- [ ] **Audit:** Do product records have a `ram` field stored?
- [ ] **Verify:** Does `session.flow_context.buy_flow.current_interest` correctly persist across turns when a price was shown?
- [ ] **Verify:** Is `exchange_details.brand` being populated when the customer mentions their current phone brand?
- [ ] **Confirm:** What triggers `details_complete = true` in the exchange flow currently? (May need updating)

---

## Appendix: Layer Map Reminder

```
Telegram Input
→ Event Normalizer             [UNTOUCHED]
→ Session Load                 [UNTOUCHED]
→ Session Bootstrap            [UNTOUCHED]
→ Understanding AI             [UNTOUCHED — scope locked]
→ Understanding JSON Guard     [UNTOUCHED]
→ Rules Layer                  [MINIMAL TOUCH — Phase 4]
→ Product Search (Convex)      [TOUCHED in Phase 1 — add ram/battery_health]
→ Business Data Resolver       [PRIMARY TOUCH — Phase 2]
→ Reply AI                     [TOUCHED — Phase 3 prompt additions]
→ Validation                   [UNTOUCHED]
→ Session Save                 [UNTOUCHED]
→ Telegram Send                [UNTOUCHED]
```

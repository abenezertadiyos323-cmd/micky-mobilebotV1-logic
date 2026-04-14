import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";

type JsonRecord = Record<string, unknown>;

const MAX_HISTORY = 24;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: JsonRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNullableString(value: unknown, fallback: string | null) {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseMoneyLikeNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const source = value.trim().toLowerCase();
  if (!source) {
    return null;
  }

  const thousandMatch = source.match(/\b(\d+(?:[.,]\d+)?)\s*(?:k|thousand)\b/);
  if (thousandMatch) {
    const amount = thousandMatch[1];
    if (amount) {
      const multiplier = Number(amount.replace(",", "."));
      return Number.isFinite(multiplier) ? Math.round(multiplier * 1000) : null;
    }
  }

  const numericChunks = source.match(/\d[\d\s,._]*/g);
  if (!numericChunks) {
    return null;
  }

  for (const chunk of numericChunks) {
    const compact = chunk.replace(/[\s_]/g, "");
    if (!compact) {
      continue;
    }

    const grouped = compact.split(/[.,]/);
    if (
      grouped.length > 1
      && grouped.every((part, index) => (index === 0 ? /^\d+$/.test(part) : /^\d{3}$/.test(part)))
    ) {
      const groupedValue = Number(grouped.join(""));
      if (Number.isFinite(groupedValue)) {
        return groupedValue;
      }
    }

    const plainValue = Number(compact.replace(/,/g, ""));
    if (Number.isFinite(plainValue)) {
      return plainValue;
    }
  }

  return null;
}

function asNullableNumber(value: unknown, fallback: number | null) {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" && !value.trim()) {
    return fallback;
  }

  const parsed = parseMoneyLikeNumber(value);
  return parsed !== null ? parsed : fallback;
}

function asCount(value: unknown, fallback: number) {
  const normalized = asNumber(value, fallback);
  return Math.max(0, Math.floor(normalized));
}

function asNullableTurnIndex(value: unknown, fallback: number | null) {
  if (value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized.replace(/[\s,_]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function normalizeOfferType(
  value: unknown,
  fallback: "single" | "multi" | "none",
): "single" | "multi" | "none" {
  if (value === "single" || value === "multi" || value === "none") {
    return value;
  }

  return fallback;
}

function normalizeProductIdList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, 3);
}

function normalizeLastOfferContext(
  incoming: unknown,
  fallback: {
    turn_index: number | null;
    offer_type: "single" | "multi" | "none";
    product_ids: string[];
  },
) {
  const source = isRecord(incoming) ? incoming : {};
  return {
    turn_index: asNullableTurnIndex(source.turn_index ?? source.turnIndex, fallback.turn_index),
    offer_type: normalizeOfferType(source.offer_type ?? source.offerType, fallback.offer_type),
    product_ids: normalizeProductIdList(source.product_ids ?? source.productIds, fallback.product_ids),
  };
}

function toArray(value: unknown, fallback: unknown[] = []) {
  return Array.isArray(value) ? value : fallback;
}

function normalizeExchangeDetails(
  incoming: unknown,
  fallback: {
    brand: string | null;
    model: string | null;
    storage: string | null;
    battery_health: string | null;
    ram: string | null;
    condition: string | null;
    expected_price_etb: number | null;
    has_images: boolean;
    photo_count: number;
    details_complete: boolean;
  },
) {
  const source = isRecord(incoming) ? incoming : {};
  return {
    brand: asNullableString(source.brand, fallback.brand),
    model: asNullableString(source.model, fallback.model),
    storage: asNullableString(source.storage, fallback.storage),
    battery_health: asNullableString(
      source.battery_health ?? source.batteryHealth,
      fallback.battery_health,
    ),
    ram: asNullableString(source.ram, fallback.ram),
    condition: asNullableString(source.condition, fallback.condition),
    expected_price_etb: asNullableNumber(
      source.expected_price_etb ?? source.expectedPriceEtb ?? source.expected_price,
      fallback.expected_price_etb,
    ),
    has_images: asBoolean(source.has_images ?? source.hasImages, fallback.has_images),
    photo_count: asCount(source.photo_count ?? source.photoCount, fallback.photo_count),
    details_complete: asBoolean(
      source.details_complete ?? source.detailsComplete,
      fallback.details_complete,
    ),
  };
}

function normalizeBuyState(
  incoming: unknown,
  fallback: { closed: boolean; close_reason: string | null },
) {
  const source = isRecord(incoming) ? incoming : {};
  return {
    closed: asBoolean(source.closed, fallback.closed),
    close_reason: asNullableString(source.close_reason ?? source.closeReason, fallback.close_reason),
  };
}

function normalizeAdminLead(
  incoming: unknown,
  fallback: {
    section: string;
    status: string;
    type: string;
    intent: string;
    has_images: boolean;
    brand: string | null;
    model: string | null;
    storage: string | null;
    battery_health: string | null;
    ram: string | null;
    expected_price_etb: number | null;
    closed: boolean;
    close_reason: string | null;
  },
) {
  const source = isRecord(incoming) ? incoming : {};
  return {
    section: asString(source.section, fallback.section),
    status: asString(source.status, fallback.status),
    type: asString(source.type, fallback.type),
    intent: asString(source.intent, fallback.intent),
    has_images: asBoolean(source.has_images ?? source.hasImages, fallback.has_images),
    brand: asNullableString(source.brand, fallback.brand),
    model: asNullableString(source.model, fallback.model),
    storage: asNullableString(source.storage, fallback.storage),
    battery_health: asNullableString(
      source.battery_health ?? source.batteryHealth,
      fallback.battery_health,
    ),
    ram: asNullableString(source.ram, fallback.ram),
    expected_price_etb: asNullableNumber(
      source.expected_price_etb ?? source.expectedPriceEtb ?? source.expected_price,
      fallback.expected_price_etb,
    ),
    closed: asBoolean(source.closed, fallback.closed),
    close_reason: asNullableString(source.close_reason ?? source.closeReason, fallback.close_reason),
  };
}

function normalizeAdminEscalation(
  incoming: unknown,
  fallback: { required: boolean; reason: string | null; status: string | null },
) {
  const source = isRecord(incoming) ? incoming : {};
  return {
    required: asBoolean(source.required, fallback.required),
    reason: asNullableString(source.reason, fallback.reason),
    status: asNullableString(source.status, fallback.status),
  };
}

function mergeConversationHistory(existing: unknown[], incoming: unknown[]) {
  const merged = [...existing, ...incoming];
  const deduped: unknown[] = [];
  const seen = new Set<string>();

  for (const item of merged) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped.slice(-MAX_HISTORY);
}

function buildSessionDefaults(customerId: string, now: number) {
  return {
    session_id: `sess_${customerId || "guest"}`,
    customer_id: customerId,
    created_at: now,
    last_message_at: now,
    message_count: 0,
    conversation_state: {
      current_topic: null as string | null,
      current_flow: null as string | null,
      is_active: true,
    },
    flow_context: {
      buy_flow: {
        shown_products: [] as unknown[],
        current_interest: null as unknown,
      },
    },
    exchange_details: {
      brand: null as string | null,
      model: null as string | null,
      storage: null as string | null,
      battery_health: null as string | null,
      ram: null as string | null,
      condition: null as string | null,
      expected_price_etb: null as number | null,
      has_images: false,
      photo_count: 0,
      details_complete: false,
    },
    buy_state: {
      closed: false,
      close_reason: null as string | null,
    },
    admin_lead: {
      section: "inbox" as string,
      status: "cold" as string,
      type: "general" as string,
      intent: "unknown" as string,
      has_images: false,
      brand: null as string | null,
      model: null as string | null,
      storage: null as string | null,
      battery_health: null as string | null,
      ram: null as string | null,
      expected_price_etb: null as number | null,
      closed: false,
      close_reason: null as string | null,
    },
    admin_section: "inbox" as string,
    admin_status: "cold" as string,
    admin_type: "general" as string,
    admin_intent: "unknown" as string,
    admin_has_images: false,
    last_offer_context: {
      turn_index: null as number | null,
      offer_type: "none" as "single" | "multi" | "none",
      product_ids: [] as string[],
    },
    last_constrained_turn: null as number | null,
    collected_constraints: {
      budget_etb: null as number | null,
      brand: null as string | null,
      model: null as string | null,
      storage: null as string | null,
      condition: null as string | null,
    },
    last_asked_key: null as string | null,
    conversation_history: [] as unknown[],
    admin_escalation: {
      required: false,
      reason: null as string | null,
      status: null as string | null,
    },
  };
}

function normalizeStoredSession(source: unknown, customerId: string, now: number) {
  const defaults = buildSessionDefaults(customerId, now);
  const record = isRecord(source) ? source : {};
  const conversationState = isRecord(record.conversation_state)
    ? record.conversation_state
    : {};
  const flowContext = isRecord(record.flow_context) ? record.flow_context : {};
  const buyFlow = isRecord(flowContext.buy_flow) ? flowContext.buy_flow : {};
  const collectedConstraints = isRecord(record.collected_constraints)
    ? record.collected_constraints
    : {};
  const exchangeDetails = isRecord(record.exchange_details) ? record.exchange_details : {};
  const buyState = isRecord(record.buy_state) ? record.buy_state : {};
  const adminLead = isRecord(record.admin_lead) ? record.admin_lead : {};
  const defaultLastOfferContext = {
    turn_index: null as number | null,
    offer_type: "none" as "single" | "multi" | "none",
    product_ids: [] as string[],
  };

  return {
    session_id: asString(record.session_id, defaults.session_id),
    customer_id: asString(record.customer_id, customerId || defaults.customer_id),
    created_at: asNumber(record.created_at, defaults.created_at),
    last_message_at: asNumber(record.last_message_at, defaults.last_message_at),
    message_count: asCount(record.message_count, defaults.message_count),
    conversation_state: {
      current_topic: asNullableString(
        conversationState.current_topic,
        defaults.conversation_state.current_topic,
      ),
      current_flow: asNullableString(
        conversationState.current_flow,
        defaults.conversation_state.current_flow,
      ),
      is_active: asBoolean(
        conversationState.is_active,
        defaults.conversation_state.is_active,
      ),
    },
    flow_context: {
      buy_flow: {
        shown_products: toArray(
          buyFlow.shown_products,
          defaults.flow_context.buy_flow.shown_products,
        ),
        current_interest: hasOwn(buyFlow, "current_interest")
          ? buyFlow.current_interest
          : defaults.flow_context.buy_flow.current_interest,
      },
    },
    exchange_details: normalizeExchangeDetails(
      record.exchange_details,
      defaults.exchange_details,
    ),
    buy_state: normalizeBuyState(record.buy_state, defaults.buy_state),
    admin_lead: normalizeAdminLead(record.admin_lead, defaults.admin_lead),
    admin_section: asString(record.admin_section, defaults.admin_section),
    admin_status: asString(record.admin_status, defaults.admin_status),
    admin_type: asString(record.admin_type, defaults.admin_type),
    admin_intent: asString(record.admin_intent, defaults.admin_intent),
    admin_has_images: asBoolean(record.admin_has_images, defaults.admin_has_images),
    last_offer_context: normalizeLastOfferContext(
      record.last_offer_context,
      defaultLastOfferContext,
    ),
    last_constrained_turn: asNullableTurnIndex(
      record.last_constrained_turn,
      defaults.last_constrained_turn,
    ),
    collected_constraints: {
      budget_etb: hasOwn(collectedConstraints, "budget_etb")
        ? asNullableNumber(
            collectedConstraints.budget_etb,
            defaults.collected_constraints.budget_etb,
          )
        : defaults.collected_constraints.budget_etb,
      brand: hasOwn(collectedConstraints, "brand")
        ? asNullableString(
            collectedConstraints.brand,
            defaults.collected_constraints.brand,
          )
        : defaults.collected_constraints.brand,
      model: hasOwn(collectedConstraints, "model")
        ? asNullableString(
            collectedConstraints.model,
            defaults.collected_constraints.model,
          )
        : defaults.collected_constraints.model,
      storage: hasOwn(collectedConstraints, "storage")
        ? asNullableString(
            collectedConstraints.storage,
            defaults.collected_constraints.storage,
          )
        : defaults.collected_constraints.storage,
      condition: hasOwn(collectedConstraints, "condition")
        ? asNullableString(
            collectedConstraints.condition,
            defaults.collected_constraints.condition,
          )
        : defaults.collected_constraints.condition,
    },
    last_asked_key: asNullableString(
      record.last_asked_key,
      defaults.last_asked_key,
    ),
    conversation_history: toArray(
      record.conversation_history,
      defaults.conversation_history,
    ).slice(-MAX_HISTORY),
    admin_escalation: normalizeAdminEscalation(
      record.admin_escalation,
      defaults.admin_escalation,
    ),
  };
}

function mergeSessionState(existing: unknown, incoming: unknown, customerId: string, now: number) {
  const base = normalizeStoredSession(existing, customerId, now);
  const patch = isRecord(incoming) ? incoming : {};
  const patchState = isRecord(patch.conversation_state) ? patch.conversation_state : {};
  const patchFlowContext = isRecord(patch.flow_context) ? patch.flow_context : {};
  const patchBuyFlow = isRecord(patchFlowContext.buy_flow) ? patchFlowContext.buy_flow : {};
  const patchConstraints = isRecord(patch.collected_constraints)
    ? patch.collected_constraints
    : {};
  const patchExchangeDetails = isRecord(patch.exchange_details) ? patch.exchange_details : {};
  const patchBuyState = isRecord(patch.buy_state) ? patch.buy_state : {};
  const patchAdminLead = isRecord(patch.admin_lead) ? patch.admin_lead : {};
  const patchLastOfferContext = isRecord(patch.last_offer_context) ? patch.last_offer_context : {};

  const shownProducts = hasOwn(patchBuyFlow, "shown_products")
    ? toArray(patchBuyFlow.shown_products)
    : base.flow_context.buy_flow.shown_products;

  const currentInterest = hasOwn(patchBuyFlow, "current_interest")
    ? patchBuyFlow.current_interest
    : base.flow_context.buy_flow.current_interest;
  const lastOfferContext = hasOwn(patch, "last_offer_context")
    ? normalizeLastOfferContext(patchLastOfferContext, base.last_offer_context)
    : base.last_offer_context;

  return {
    session_id: asString(patch.session_id, base.session_id),
    customer_id: customerId,
    created_at: base.created_at,
    last_message_at: asNumber(patch.last_message_at, now),
    message_count: hasOwn(patch, "message_count")
      ? asCount(patch.message_count, base.message_count)
      : base.message_count,
    conversation_state: {
      current_topic: hasOwn(patchState, "current_topic")
        ? asNullableString(
            patchState.current_topic,
            base.conversation_state.current_topic,
          )
        : base.conversation_state.current_topic,
      current_flow: hasOwn(patchState, "current_flow")
        ? asNullableString(
            patchState.current_flow,
            base.conversation_state.current_flow,
          )
        : base.conversation_state.current_flow,
      is_active: hasOwn(patchState, "is_active")
        ? asBoolean(patchState.is_active, base.conversation_state.is_active)
        : base.conversation_state.is_active,
    },
    flow_context: {
      buy_flow: {
        shown_products: shownProducts,
        current_interest: currentInterest,
      },
    },
    exchange_details: {
      brand: hasOwn(patchExchangeDetails, "brand")
        ? asNullableString(
            patchExchangeDetails.brand,
            base.exchange_details.brand,
          )
        : base.exchange_details.brand,
      model: hasOwn(patchExchangeDetails, "model")
        ? asNullableString(
            patchExchangeDetails.model,
            base.exchange_details.model,
          )
        : base.exchange_details.model,
      storage: hasOwn(patchExchangeDetails, "storage")
        ? asNullableString(
            patchExchangeDetails.storage,
            base.exchange_details.storage,
          )
        : base.exchange_details.storage,
      battery_health: hasOwn(patchExchangeDetails, "battery_health")
        ? asNullableString(
            patchExchangeDetails.battery_health,
            base.exchange_details.battery_health,
          )
        : base.exchange_details.battery_health,
      ram: hasOwn(patchExchangeDetails, "ram")
        ? asNullableString(
            patchExchangeDetails.ram,
            base.exchange_details.ram,
          )
        : base.exchange_details.ram,
      condition: hasOwn(patchExchangeDetails, "condition")
        ? asNullableString(
            patchExchangeDetails.condition,
            base.exchange_details.condition,
          )
        : base.exchange_details.condition,
      expected_price_etb: hasOwn(patchExchangeDetails, "expected_price_etb")
        ? asNullableNumber(
            patchExchangeDetails.expected_price_etb,
            base.exchange_details.expected_price_etb,
          )
        : base.exchange_details.expected_price_etb,
      has_images: hasOwn(patchExchangeDetails, "has_images")
        ? asBoolean(patchExchangeDetails.has_images, base.exchange_details.has_images)
        : base.exchange_details.has_images,
      photo_count: hasOwn(patchExchangeDetails, "photo_count")
        ? asCount(patchExchangeDetails.photo_count, base.exchange_details.photo_count)
        : base.exchange_details.photo_count,
      details_complete: hasOwn(patchExchangeDetails, "details_complete")
        ? asBoolean(
            patchExchangeDetails.details_complete,
            base.exchange_details.details_complete,
          )
        : base.exchange_details.details_complete,
    },
    buy_state: {
      closed: hasOwn(patchBuyState, "closed")
        ? asBoolean(patchBuyState.closed, base.buy_state.closed)
        : base.buy_state.closed,
      close_reason: hasOwn(patchBuyState, "close_reason")
        ? asNullableString(
            patchBuyState.close_reason,
            base.buy_state.close_reason,
          )
        : base.buy_state.close_reason,
    },
    admin_lead: {
      section: hasOwn(patchAdminLead, "section")
        ? asString(patchAdminLead.section, base.admin_lead.section)
        : base.admin_lead.section,
      status: hasOwn(patchAdminLead, "status")
        ? asString(patchAdminLead.status, base.admin_lead.status)
        : base.admin_lead.status,
      type: hasOwn(patchAdminLead, "type")
        ? asString(patchAdminLead.type, base.admin_lead.type)
        : base.admin_lead.type,
      intent: hasOwn(patchAdminLead, "intent")
        ? asString(patchAdminLead.intent, base.admin_lead.intent)
        : base.admin_lead.intent,
      has_images: hasOwn(patchAdminLead, "has_images")
        ? asBoolean(patchAdminLead.has_images, base.admin_lead.has_images)
        : base.admin_lead.has_images,
      brand: hasOwn(patchAdminLead, "brand")
        ? asNullableString(patchAdminLead.brand, base.admin_lead.brand)
        : base.admin_lead.brand,
      model: hasOwn(patchAdminLead, "model")
        ? asNullableString(patchAdminLead.model, base.admin_lead.model)
        : base.admin_lead.model,
      storage: hasOwn(patchAdminLead, "storage")
        ? asNullableString(patchAdminLead.storage, base.admin_lead.storage)
        : base.admin_lead.storage,
      battery_health: hasOwn(patchAdminLead, "battery_health")
        ? asNullableString(
            patchAdminLead.battery_health,
            base.admin_lead.battery_health,
          )
        : base.admin_lead.battery_health,
      ram: hasOwn(patchAdminLead, "ram")
        ? asNullableString(patchAdminLead.ram, base.admin_lead.ram)
        : base.admin_lead.ram,
      expected_price_etb: hasOwn(patchAdminLead, "expected_price_etb")
        ? asNullableNumber(
            patchAdminLead.expected_price_etb,
            base.admin_lead.expected_price_etb,
          )
        : base.admin_lead.expected_price_etb,
      closed: hasOwn(patchAdminLead, "closed")
        ? asBoolean(patchAdminLead.closed, base.admin_lead.closed)
        : base.admin_lead.closed,
      close_reason: hasOwn(patchAdminLead, "close_reason")
        ? asNullableString(
            patchAdminLead.close_reason,
            base.admin_lead.close_reason,
          )
        : base.admin_lead.close_reason,
    },
    admin_section: hasOwn(patch, "admin_section")
      ? asString(patch.admin_section, base.admin_section)
      : base.admin_section,
    admin_status: hasOwn(patch, "admin_status")
      ? asString(patch.admin_status, base.admin_status)
      : base.admin_status,
    admin_type: hasOwn(patch, "admin_type")
      ? asString(patch.admin_type, base.admin_type)
      : base.admin_type,
    admin_intent: hasOwn(patch, "admin_intent")
      ? asString(patch.admin_intent, base.admin_intent)
      : base.admin_intent,
    admin_has_images: hasOwn(patch, "admin_has_images")
      ? asBoolean(patch.admin_has_images, base.admin_has_images)
      : base.admin_has_images,
    last_offer_context: lastOfferContext,
    last_constrained_turn: hasOwn(patch, "last_constrained_turn")
      ? asNullableTurnIndex(patch.last_constrained_turn, base.last_constrained_turn)
      : base.last_constrained_turn,
    collected_constraints: {
      budget_etb: hasOwn(patchConstraints, "budget_etb")
        ? asNullableNumber(
            patchConstraints.budget_etb,
            base.collected_constraints.budget_etb,
          )
        : base.collected_constraints.budget_etb,
      brand: hasOwn(patchConstraints, "brand")
        ? asNullableString(
            patchConstraints.brand,
            base.collected_constraints.brand,
          )
        : base.collected_constraints.brand,
      model: hasOwn(patchConstraints, "model")
        ? asNullableString(
            patchConstraints.model,
            base.collected_constraints.model,
          )
        : base.collected_constraints.model,
      storage: hasOwn(patchConstraints, "storage")
        ? asNullableString(
            patchConstraints.storage,
            base.collected_constraints.storage,
          )
        : base.collected_constraints.storage,
      condition: hasOwn(patchConstraints, "condition")
        ? asNullableString(
            patchConstraints.condition,
            base.collected_constraints.condition,
          )
        : base.collected_constraints.condition,
    },
    last_asked_key: hasOwn(patch, "last_asked_key")
      ? asNullableString(patch.last_asked_key, base.last_asked_key)
      : base.last_asked_key,
    conversation_history: hasOwn(patch, "conversation_history")
      ? toArray(patch.conversation_history).slice(-MAX_HISTORY)
      : base.conversation_history,
    admin_escalation: hasOwn(patch, "admin_escalation")
      ? normalizeAdminEscalation(
          patch.admin_escalation,
          base.admin_escalation,
        )
      : base.admin_escalation,
  };
}

export const loadByCustomerChat = internalQuery({
  args: {
    customerId: v.string(),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionDoc = await ctx.db
      .query("sessions")
      .withIndex("by_customer_chat", (q) =>
        q.eq("customer_id", args.customerId).eq("chat_id", args.chatId),
      )
      .unique();

    if (!sessionDoc) {
      return null;
    }

    return {
      session_id: sessionDoc.session_id,
      customer_id: sessionDoc.customer_id,
      created_at: sessionDoc.created_at,
      last_message_at: sessionDoc.last_message_at,
      message_count: sessionDoc.message_count,
      conversation_state: sessionDoc.conversation_state,
      flow_context: sessionDoc.flow_context,
      exchange_details: sessionDoc.exchange_details,
      buy_state: sessionDoc.buy_state,
      admin_lead: sessionDoc.admin_lead,
      admin_section: sessionDoc.admin_section,
      admin_status: sessionDoc.admin_status,
      admin_type: sessionDoc.admin_type,
      admin_intent: sessionDoc.admin_intent,
      admin_has_images: sessionDoc.admin_has_images,
      last_offer_context: sessionDoc.last_offer_context,
      last_constrained_turn: sessionDoc.last_constrained_turn,
      collected_constraints: sessionDoc.collected_constraints,
      last_asked_key: sessionDoc.last_asked_key,
      conversation_history: sessionDoc.conversation_history,
      admin_escalation: sessionDoc.admin_escalation,
    };
  },
});

export const saveByCustomerChat = internalMutation({
  args: {
    customerId: v.string(),
    chatId: v.string(),
    session: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingDoc = await ctx.db
      .query("sessions")
      .withIndex("by_customer_chat", (q) =>
        q.eq("customer_id", args.customerId).eq("chat_id", args.chatId),
      )
      .unique();

    const mergedSession = mergeSessionState(
      existingDoc ?? null,
      args.session,
      args.customerId,
      now,
    );

    const writePayload = {
      customer_id: args.customerId,
      chat_id: args.chatId,
      session_id: mergedSession.session_id,
      created_at: mergedSession.created_at,
      last_message_at: mergedSession.last_message_at,
      message_count: mergedSession.message_count,
      conversation_state: mergedSession.conversation_state,
      flow_context: mergedSession.flow_context,
      exchange_details: mergedSession.exchange_details,
      buy_state: mergedSession.buy_state,
      admin_lead: mergedSession.admin_lead,
      admin_section: mergedSession.admin_section,
      admin_status: mergedSession.admin_status,
      admin_type: mergedSession.admin_type,
      admin_intent: mergedSession.admin_intent,
      admin_has_images: mergedSession.admin_has_images,
      last_offer_context: mergedSession.last_offer_context,
      last_constrained_turn: mergedSession.last_constrained_turn,
      collected_constraints: mergedSession.collected_constraints,
      last_asked_key: mergedSession.last_asked_key,
      conversation_history: mergedSession.conversation_history,
      admin_escalation: mergedSession.admin_escalation,
      updated_at: now,
    };

    if (existingDoc) {
      await ctx.db.patch(existingDoc._id, writePayload);
    } else {
      await ctx.db.insert("sessions", writePayload);
    }

    return mergedSession;
  },
});

export const createSession = mutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("sessions", {
      createdAt: Date.now(),
    });
    return id;
  },
});

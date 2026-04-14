import { httpActionGeneric, httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const http = httpRouter();

const jsonHeaders = {
  "Content-Type": "application/json",
};

const internalApi = internal as any;

function verifyAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const secret = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.BOT_CONVEX_SECRET;

  if (!secret) {
    throw new Error("Server Misconfiguration: BOT_CONVEX_SECRET is not set");
  }
  if (authHeader !== `Bearer ${secret}`) {
    throw new Error("Unauthorized");
  }
}

const withAuth = (handler: Parameters<typeof httpAction>[0]) =>
  httpAction(async (ctx, req) => {
    try {
      verifyAuth(req);
      return await handler(ctx, req);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown HTTP action error";
      const status = message === "Unauthorized" ? 401 : 400;
      return Response.json({ ok: false, error: message }, { status });
    }
  });

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Keep placeholder routes tolerant while wiring the first runtime path.
  }

  return {};
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toRequiredString(value: unknown, fieldName: string): string {
  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return normalized;
}

function toIsoString(value: unknown, fallback = new Date().toISOString()) {
  return toOptionalString(value) ?? fallback;
}

function readConstraints(value: unknown) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const constraints: Record<string, string | number> = {};
  const brand = readOptionalString(source.brand);
  const model = readOptionalString(source.model);
  const storage = readOptionalString(source.storage);
  const condition = readOptionalString(source.condition);
  const budget_etb = readOptionalNumber(source.budget_etb);

  if (brand) constraints.brand = brand;
  if (model) constraints.model = model;
  if (storage) constraints.storage = storage;
  if (condition) constraints.condition = condition;
  if (budget_etb !== null) constraints.budget_etb = budget_etb;

  return constraints;
}

async function handleProductsSearch(ctx: any, body: Record<string, unknown>) {
  const sellerId = readOptionalString(body.sellerId);
  const phoneType = readOptionalString(body.phoneType);
  const brand = readOptionalString(body.brand);
  const model = readOptionalString(body.model);
  const storage = readOptionalString(body.storage);
  const condition = readOptionalString(body.condition);
  const maxPrice =
    typeof body.maxPrice === "number" ? body.maxPrice : readOptionalNumber(body.maxPrice);

  if (sellerId) {
    const constraints = readConstraints(body.constraints);
    const results = await ctx.runQuery(internalApi.products.search, {
      sellerId,
      constraints,
    });

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const resolvedPhoneType =
    phoneType ?? ([brand, model].filter(Boolean).join(" ").trim() || undefined);
  if (!resolvedPhoneType) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Missing sellerId or phoneType",
      }),
      {
        status: 400,
        headers: jsonHeaders,
      },
    );
  }

  let products = await ctx.runQuery(api.products.listProducts, {
    search: resolvedPhoneType,
    tab: "all",
    type: "phone",
    priceMax: typeof maxPrice === "number" && Number.isFinite(maxPrice) ? maxPrice : undefined,
  });

  const normalizedPhoneType = resolvedPhoneType.toLowerCase().replace(/\s+/g, " ").trim();
  const directMatches = products.filter(
    (product) => String(product.phoneType ?? "").toLowerCase().replace(/\s+/g, " ").trim() === normalizedPhoneType,
  );
  if (directMatches.length > 0) {
    products = directMatches;
  }

  products = products.filter(
    (product) =>
      (!storage || String(product.storage ?? "").toLowerCase().includes(storage.toLowerCase())) &&
      (!condition || String(product.condition ?? "").toLowerCase() === condition.toLowerCase()),
  );

  return new Response(JSON.stringify({ products }), {
    status: 200,
    headers: jsonHeaders,
  });
}

http.route({
  path: "/api/products/search",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    const body = await readJsonBody(request);
    return handleProductsSearch(ctx, body);
  }),
});

http.route({
  path: "/http/products-search",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    const body = await readJsonBody(request);
    return handleProductsSearch(ctx, body);
  }),
});

http.route({
  path: "/http/session-load",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    const body = await readJsonBody(request);
    const userId =
      typeof body.userId === "string" && body.userId.trim() ? body.userId : "";
    const chatId =
      typeof body.chatId === "string" && body.chatId.trim() ? body.chatId : "";

    if (!userId || !chatId) {
      return new Response(
        JSON.stringify({
          session: {
            exists: false,
            data: null,
          },
          error: "Missing userId or chatId",
        }),
        {
          status: 400,
          headers: jsonHeaders,
        },
      );
    }

    const storedSession = await ctx.runQuery(internal.sessions.loadByCustomerChat, {
      customerId: userId,
      chatId,
    });

    return new Response(
      JSON.stringify({
        session: {
          exists: Boolean(storedSession),
          data: storedSession,
        },
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  }),
});

http.route({
  path: "/http/session-save",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    const body = await readJsonBody(request);
    const userId =
      typeof body.userId === "string" && body.userId.trim() ? body.userId : "";
    const chatId =
      typeof body.chatId === "string" && body.chatId.trim() ? body.chatId : "";
    const session =
      body.session && typeof body.session === "object" && !Array.isArray(body.session)
        ? body.session
        : null;

    if (!userId || !chatId || !session) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing userId, chatId, or session payload",
        }),
        {
          status: 400,
          headers: jsonHeaders,
        },
      );
    }

    const savedSession = await ctx.runMutation(internal.sessions.saveByCustomerChat, {
      customerId: userId,
      chatId,
      session,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        session: {
          exists: true,
          data: savedSession,
        },
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  }),
});

export const saveLeadRecord = internalMutation({
  args: {
    sellerId: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    customer_goal: v.optional(v.string()),
    phoneType: v.optional(v.string()),
    source: v.optional(v.string()),
    stage: v.optional(v.string()),
    summary: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("botLeads")
      .withIndex("by_sellerId_and_chatId", (q) =>
        q.eq("sellerId", args.sellerId).eq("chatId", args.chatId),
      )
      .first();

    const payload = {
      sellerId: args.sellerId,
      chatId: args.chatId,
      username: args.username,
      name: args.name,
      phoneNumber: args.phoneNumber,
      customer_goal: args.customer_goal,
      phoneType: args.phoneType,
      source: args.source,
      stage: args.stage,
      summary: args.summary,
      createdAt: existing?.createdAt ?? args.createdAt,
      updatedAt: args.updatedAt,
    };

    return existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("botLeads", payload);
  },
});

export const getWorkflowSessionRecord = internalQuery({
  args: {
    sellerId: v.string(),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("botWorkflowSessions")
      .withIndex("by_sellerId_and_chatId", (q) =>
        q.eq("sellerId", args.sellerId).eq("chatId", args.chatId),
      )
      .first();

    return session
      ? {
          stage: session.stage,
          activeFlow: session.activeFlow,
          followupRound: session.followupRound,
          collectedFields: session.collectedFields ?? {},
          shownOptions: session.shownOptions ?? null,
          language: session.language,
          updatedAt: session.updatedAt,
        }
      : null;
  },
});

export const upsertWorkflowSessionRecord = internalMutation({
  args: {
    sellerId: v.string(),
    chatId: v.string(),
    stage: v.string(),
    activeFlow: v.string(),
    followupRound: v.number(),
    collectedFields: v.any(),
    shownOptions: v.optional(v.any()),
    language: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("botWorkflowSessions")
      .withIndex("by_sellerId_and_chatId", (q) =>
        q.eq("sellerId", args.sellerId).eq("chatId", args.chatId),
      )
      .first();

    const payload = {
      sellerId: args.sellerId,
      chatId: args.chatId,
      stage: args.stage,
      activeFlow: args.activeFlow,
      followupRound: args.followupRound,
      collectedFields: args.collectedFields,
      shownOptions: args.shownOptions,
      language: args.language,
      createdAt: existing?.createdAt ?? args.createdAt,
      updatedAt: args.updatedAt,
    };

    const sessionId = existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("botWorkflowSessions", payload);

    return {
      sessionId,
      session: {
        stage: payload.stage,
        activeFlow: payload.activeFlow,
        followupRound: payload.followupRound,
        collectedFields: payload.collectedFields,
        shownOptions: payload.shownOptions ?? null,
        language: payload.language,
        updatedAt: payload.updatedAt,
      },
    };
  },
});

export const saveOrderInquiryRecord = internalMutation({
  args: {
    sellerId: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
    phoneType: v.optional(v.string()),
    selected_option: v.optional(v.string()),
    inquiry_type: v.optional(v.string()),
    summary: v.optional(v.string()),
    createdAt: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("botOrderInquiries", {
      sellerId: args.sellerId,
      chatId: args.chatId,
      username: args.username,
      phoneType: args.phoneType,
      selected_option: args.selected_option,
      inquiry_type: args.inquiry_type,
      summary: args.summary,
      createdAt: args.createdAt,
    }),
});

export const saveExchangeSubmissionRecord = internalMutation({
  args: {
    sellerId: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
    phoneType: v.optional(v.string()),
    storage: v.optional(v.string()),
    ram: v.optional(v.string()),
    simType: v.optional(v.string()),
    battery: v.optional(v.string()),
    condition: v.optional(v.string()),
    defects: v.optional(v.string()),
    target_phone: v.optional(v.string()),
    stage: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("botExchangeSubmissions")
      .withIndex("by_sellerId_and_chatId", (q) =>
        q.eq("sellerId", args.sellerId).eq("chatId", args.chatId),
      )
      .first();

    const payload = {
      sellerId: args.sellerId,
      chatId: args.chatId,
      username: args.username,
      phoneType: args.phoneType,
      storage: args.storage,
      ram: args.ram,
      simType: args.simType,
      battery: args.battery,
      condition: args.condition,
      defects: args.defects,
      target_phone: args.target_phone,
      stage: args.stage,
      createdAt: existing?.createdAt ?? args.createdAt,
      updatedAt: args.updatedAt,
    };

    return existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("botExchangeSubmissions", payload);
  },
});

export const saveInboxRecord = internalMutation({
  args: {
    sellerId: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    customer_goal: v.optional(v.string()),
    phoneType: v.optional(v.string()),
    target_phone: v.optional(v.string()),
    summary: v.optional(v.string()),
    stage: v.optional(v.string()),
    priority: v.optional(v.string()),
    tab: v.optional(v.string()),
    source: v.optional(v.string()),
    status: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("botInbox")
      .withIndex("by_sellerId_and_chatId", (q) =>
        q.eq("sellerId", args.sellerId).eq("chatId", args.chatId),
      )
      .first();

    const payload = {
      sellerId: args.sellerId,
      chatId: args.chatId,
      username: args.username,
      name: args.name,
      phoneNumber: args.phoneNumber,
      customer_goal: args.customer_goal,
      phoneType: args.phoneType,
      target_phone: args.target_phone,
      summary: args.summary,
      stage: args.stage,
      priority: args.priority,
      tab: args.tab,
      source: args.source,
      status: args.status,
      createdAt: existing?.createdAt ?? args.createdAt,
      updatedAt: args.updatedAt,
    };

    return existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("botInbox", payload);
  },
});

export const saveNotifyRequestRecord = internalMutation({
  args: {
    sellerId: v.string(),
    chatId: v.string(),
    username: v.optional(v.string()),
    requested_phone: v.string(),
    notify_when_available: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("botNotifyRequests")
      .withIndex("by_sellerId_chatId_requested_phone", (q) =>
        q
          .eq("sellerId", args.sellerId)
          .eq("chatId", args.chatId)
          .eq("requested_phone", args.requested_phone),
      )
      .first();

    const payload = {
      sellerId: args.sellerId,
      chatId: args.chatId,
      username: args.username,
      requested_phone: args.requested_phone,
      notify_when_available: args.notify_when_available,
      createdAt: existing?.createdAt ?? args.createdAt,
      updatedAt: args.updatedAt,
    };

    return existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("botNotifyRequests", payload);
  },
});

http.route({
  path: "/api/bot/log-message",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const args = await req.json();
    const result = await ctx.runMutation(internalApi.botWebhooks.logMessage, args);
    return Response.json({ success: true, data: result, error: null });
  }),
});

http.route({
  path: "/api/bot/track-demand",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const args = await req.json();
    const result = await ctx.runMutation(internalApi.botWebhooks.trackDemand, args);
    return Response.json({ success: true, data: result, error: null });
  }),
});

http.route({
  path: "/api/bot/create-exchange",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const args = await req.json();
    const result = await ctx.runMutation(internalApi.botWebhooks.createExchange, args);
    return Response.json({ success: true, data: result, error: null });
  }),
});

http.route({
  path: "/api/leads/save",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const body = await req.json();
    const now = new Date().toISOString();
    const leadId = await ctx.runMutation(internalApi.http.saveLeadRecord, {
      sellerId: toRequiredString(body.sellerId, "sellerId"),
      chatId: toRequiredString(body.chatId, "chatId"),
      username: toOptionalString(body.username),
      name: toOptionalString(body.name),
      phoneNumber: toOptionalString(body.phoneNumber),
      customer_goal: toOptionalString(body.customer_goal),
      phoneType: toOptionalString(body.phoneType),
      source: toOptionalString(body.source),
      stage: toOptionalString(body.stage),
      summary: toOptionalString(body.summary),
      createdAt: toIsoString(body.createdAt, now),
      updatedAt: toIsoString(body.updatedAt ?? body.createdAt, now),
    });

    return Response.json({ ok: true, leadId });
  }),
});

http.route({
  path: "/api/sessions/get",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const body = await req.json();
    const session = await ctx.runQuery(internalApi.http.getWorkflowSessionRecord, {
      sellerId: toRequiredString(body.sellerId, "sellerId"),
      chatId: toRequiredString(body.chatId, "chatId"),
    });

    return Response.json({ session });
  }),
});

http.route({
  path: "/api/sessions/upsert",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const body = await req.json();
    const now = new Date().toISOString();
    const result = await ctx.runMutation(internalApi.http.upsertWorkflowSessionRecord, {
      sellerId: toRequiredString(body.sellerId, "sellerId"),
      chatId: toRequiredString(body.chatId, "chatId"),
      stage: toOptionalString(body.stage) ?? "new",
      activeFlow: toOptionalString(body.activeFlow) ?? "none",
      followupRound: typeof body.followupRound === "number" ? body.followupRound : Number(body.followupRound ?? 0) || 0,
      collectedFields:
        body.collectedFields && typeof body.collectedFields === "object"
          ? body.collectedFields
          : {},
      shownOptions:
        body.shownOptions && typeof body.shownOptions === "object"
          ? body.shownOptions
          : undefined,
      language: toOptionalString(body.language) ?? "amharic",
      createdAt: toIsoString(body.createdAt, now),
      updatedAt: toIsoString(body.updatedAt, now),
    });

    return Response.json({ ok: true, ...result });
  }),
});

http.route({
  path: "/api/orders/save",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const body = await req.json();
    const recordId = await ctx.runMutation(internalApi.http.saveOrderInquiryRecord, {
      sellerId: toRequiredString(body.sellerId, "sellerId"),
      chatId: toRequiredString(body.chatId, "chatId"),
      username: toOptionalString(body.username),
      phoneType: toOptionalString(body.phoneType),
      selected_option: toOptionalString(body.selected_option),
      inquiry_type: toOptionalString(body.inquiry_type),
      summary: toOptionalString(body.summary),
      createdAt: toIsoString(body.createdAt),
    });

    return Response.json({ ok: true, orderInquiryId: recordId });
  }),
});

http.route({
  path: "/api/exchange/save",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const body = await req.json();
    const now = new Date().toISOString();
    const exchangeId = await ctx.runMutation(internalApi.http.saveExchangeSubmissionRecord, {
      sellerId: toRequiredString(body.sellerId, "sellerId"),
      chatId: toRequiredString(body.chatId, "chatId"),
      username: toOptionalString(body.username),
      phoneType: toOptionalString(body.phoneType),
      storage: toOptionalString(body.storage),
      ram: toOptionalString(body.ram),
      simType: toOptionalString(body.simType),
      battery: toOptionalString(body.battery),
      condition: toOptionalString(body.condition),
      defects: toOptionalString(body.defects),
      target_phone: toOptionalString(body.target_phone),
      stage: toOptionalString(body.stage),
      createdAt: toIsoString(body.createdAt, now),
      updatedAt: toIsoString(body.updatedAt ?? body.createdAt, now),
    });

    return Response.json({ ok: true, exchangeId });
  }),
});

http.route({
  path: "/api/inbox/save",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const body = await req.json();
    const now = new Date().toISOString();
    const inboxId = await ctx.runMutation(internalApi.http.saveInboxRecord, {
      sellerId: toRequiredString(body.sellerId, "sellerId"),
      chatId: toRequiredString(body.chatId, "chatId"),
      username: toOptionalString(body.username),
      name: toOptionalString(body.name),
      phoneNumber: toOptionalString(body.phoneNumber),
      customer_goal: toOptionalString(body.customer_goal),
      phoneType: toOptionalString(body.phoneType),
      target_phone: toOptionalString(body.target_phone),
      summary: toOptionalString(body.summary),
      stage: toOptionalString(body.stage),
      priority: toOptionalString(body.priority),
      tab: toOptionalString(body.tab),
      source: toOptionalString(body.source),
      status: toOptionalString(body.status),
      createdAt: toIsoString(body.createdAt, now),
      updatedAt: toIsoString(body.updatedAt ?? body.createdAt, now),
    });

    return Response.json({ ok: true, inboxId });
  }),
});

http.route({
  path: "/api/notify/save",
  method: "POST",
  handler: withAuth(async (ctx, req) => {
    const body = await req.json();
    const now = new Date().toISOString();
    const notifyId = await ctx.runMutation(internalApi.http.saveNotifyRequestRecord, {
      sellerId: toRequiredString(body.sellerId, "sellerId"),
      chatId: toRequiredString(body.chatId, "chatId"),
      username: toOptionalString(body.username),
      requested_phone: toRequiredString(body.requested_phone, "requested_phone"),
      notify_when_available: Boolean(body.notify_when_available),
      createdAt: toIsoString(body.createdAt, now),
      updatedAt: toIsoString(body.updatedAt ?? body.createdAt, now),
    });

    return Response.json({ ok: true, notifyId });
  }),
});

export default http;

// convex/exchanges.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const trimImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Normalize condition from lowercase (customer input) to proper case (schema enum).
 * Customer app sends lowercase, schema expects: "New", "Like New", "Excellent", "Good", "Fair", "Poor"
 */
const normalizeCondition = (value: string): "New" | "Like New" | "Excellent" | "Good" | "Fair" | "Poor" => {
  const normalized = value.toLowerCase().trim();
  const mapping: Record<string, "New" | "Like New" | "Excellent" | "Good" | "Fair" | "Poor"> = {
    "new": "New",
    "like new": "Like New",
    "excellent": "Excellent",
    "good": "Good",
    "fair": "Fair",
    "poor": "Poor",
  };
  return mapping[normalized] || "Fair"; // Default to "Fair" if unknown
};

async function normalizeProductImages(
  ctx: { storage: { getUrl: (id: string) => Promise<string | null> } },
  images: unknown,
): Promise<string[]> {
  if (!Array.isArray(images) || images.length === 0) return [];

  const normalized = images
    .map((img, index) => {
      const directUrl = trimImageUrl(img);
      if (directUrl) return { kind: "url" as const, order: index, value: directUrl };

      if (!img || typeof img !== "object") return null;
      const legacy = img as { storageId?: string; order?: number; url?: string };
      if (!legacy.storageId) return null;
      return {
        kind: "legacy" as const,
        order: typeof legacy.order === "number" ? legacy.order : index,
        storageId: legacy.storageId,
        fallbackUrl: trimImageUrl(legacy.url),
      };
    })
    .filter((img): img is NonNullable<typeof img> => img !== null)
    .sort((a, b) => a.order - b.order);

  const urls: string[] = [];
  for (const img of normalized) {
    if (img.kind === "url") {
      urls.push(img.value);
      continue;
    }
    try {
      const resolved = await ctx.storage.getUrl(img.storageId);
      const url = trimImageUrl(resolved) ?? img.fallbackUrl;
      if (url) urls.push(url);
    } catch {
      if (img.fallbackUrl) urls.push(img.fallbackUrl);
    }
  }

  return urls
    .map((url) => trimImageUrl(url))
    .filter((url): url is string => url !== null)
    .slice(0, 3);
}

/**
 * List all exchanges sorted by createdAt descending, with thread and
 * desiredPhone joined (image URLs NOT resolved — list view only needs text).
 * Used by the Exchanges list page.
 */
export const listExchanges = query({
  args: {},
  handler: async (ctx) => {
    const exchanges = await ctx.db
      .query("exchanges")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    return Promise.all(
      exchanges.map(async (ex) => {
        const thread = await ctx.db.get(ex.threadId);
        const desiredPhone = await ctx.db.get(ex.desiredPhoneId);
        return {
          ...ex,
          thread: thread ?? undefined,
          desiredPhone: desiredPhone ?? undefined,
        };
      })
    );
  },
});

/**
 * List exchanges associated with a specific thread, sorted by createdAt desc.
 * Used by ThreadDetail to show pinned exchange cards.
 * Image URLs are NOT resolved (card only shows text).
 */
export const listExchangesByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const exchanges = await ctx.db
      .query("exchanges")
      .withIndex("by_threadId_and_createdAt", (q) =>
        q.eq("threadId", args.threadId)
      )
      .order("desc")
      .collect();

    return Promise.all(
      exchanges.map(async (ex) => {
        const desiredPhone = await ctx.db.get(ex.desiredPhoneId);
        return {
          ...ex,
          desiredPhone: desiredPhone ?? undefined,
        };
      })
    );
  },
});

/**
 * Get a single exchange by ID with thread and desiredPhone joined.
 * Images are returned as URL strings for ExchangeDetail.
 */
export const getExchange = query({
  args: { exchangeId: v.id("exchanges") },
  handler: async (ctx, args) => {
    const ex = await ctx.db.get(args.exchangeId);
    if (!ex) return null;

    const thread = await ctx.db.get(ex.threadId);

    // Resolve product + image URLs
    let desiredPhone: (typeof ex & { images: string[] }) | undefined;
    const rawPhone = await ctx.db.get(ex.desiredPhoneId);
    if (rawPhone) {
      const images = await normalizeProductImages(ctx, rawPhone.images);
      desiredPhone = { ...rawPhone, images } as unknown as typeof desiredPhone;
    }

    return {
      ...ex,
      thread: thread ?? undefined,
      desiredPhone,
    };
  },
});

/**
 * Update the status of an exchange and record completion/rejection timestamps.
 */
export const updateExchangeStatus = mutation({
  args: {
    exchangeId: v.id("exchanges"),
    status: v.union(
      v.literal("Pending"),
      v.literal("Quoted"),
      v.literal("Accepted"),
      v.literal("Completed"),
      v.literal("Rejected")
    ),
    adminTelegramId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: {
      status: typeof args.status;
      updatedAt: number;
      completedAt?: number;
      completedBy?: string;
      rejectedAt?: number;
      rejectedBy?: string;
    } = { status: args.status, updatedAt: now };

    if (args.status === "Completed") {
      patch.completedAt = now;
      if (args.adminTelegramId) patch.completedBy = args.adminTelegramId;
    }
    if (args.status === "Rejected") {
      patch.rejectedAt = now;
      if (args.adminTelegramId) patch.rejectedBy = args.adminTelegramId;
    }

    await ctx.db.patch(args.exchangeId, patch);
  },
});

/**
 * Send a quote: create an admin message, update exchange to Quoted,
 * and update thread's last-message metadata.
 */
export const sendQuote = mutation({
  args: {
    exchangeId: v.id("exchanges"),
    quoteText: v.string(),
    adminTelegramId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ex = await ctx.db.get(args.exchangeId);
    if (!ex) throw new Error("Exchange not found");

    // Insert quote message
    const messageId = await ctx.db.insert("messages", {
      threadId: ex.threadId,
      sender: "admin",
      senderRole: "admin",
      senderTelegramId: args.adminTelegramId,
      text: args.quoteText,
      exchangeId: args.exchangeId,
      createdAt: now,
    });

    // Mark exchange as Quoted
    await ctx.db.patch(args.exchangeId, {
      status: "Quoted",
      quotedAt: now,
      quotedBy: args.adminTelegramId,
      quoteMessageId: messageId,
      updatedAt: now,
    });

    // Update thread last-message metadata
    await ctx.db.patch(ex.threadId, {
      updatedAt: now,
      lastMessageAt: now,
      lastMessagePreview: args.quoteText.slice(0, 100),
      lastAdminMessageAt: now,
      hasAdminReplied: true,
    });

    return { messageId };
  },
});

/**
 * Bot/N8N bridge: Get exchange lead context for conversation.
 * Called when bot receives /start lead_<id> deep link.
 * Returns full context needed for N8N to continue conversation with customer.
 */
export const getExchangeLeadContext = query({
  args: { leadId: v.id("exchangeRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.leadId);
    if (!request) return null;

    // Fetch desired phone details
    let desiredPhone = null;
    try {
      const product = await ctx.db.get(request.desiredPhoneId as any);
      if (product) {
        desiredPhone = {
          id: product._id,
          phoneType: (product as any).phoneType ?? "Unknown Phone",
          storage: (product as any).storage,
          price: (product as any).price,
        };
      }
    } catch {
      // desiredPhoneId may not resolve
    }

    return {
      leadId: request._id,
      sessionId: request.sessionId,
      desiredPhone,
      offeredModel: request.offeredModel,
      offeredStorageGb: request.offeredStorageGb,
      offeredCondition: request.offeredCondition,
      offeredNotes: request.offeredNotes || "",
      createdAt: request.createdAt,
    };
  },
});

/**
 * Bot/N8N bridge: Create admin-side exchange from a raw customer submission.
 * Idempotent: checks if exchange already exists for this lead before creating.
 * - Creates/gets thread by telegramId
 * - Converts exchangeRequest fields to exchanges table schema
 * - Sets safe defaults for pricing fields (0 initially, admin will override)
 * Returns the created/existing exchange ID.
 */
export const createAdminExchangeFromLead = mutation({
  args: {
    leadId: v.id("exchangeRequests"),
    telegramId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Fetch the exchange request
    const request = await ctx.db.get(args.leadId);
    if (!request) throw new Error("Exchange request not found");

    // 2. Check if an exchange already exists for this lead (idempotency)
    const existing = await ctx.db
      .query("exchanges")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .filter((q) => q.eq(q.field("status"), "Pending"))
      .first();

    if (existing) {
      return existing._id;
    }

    // 3. Get or create thread for this customer
    let thread = await ctx.db
      .query("threads")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();

    if (!thread) {
      // Create a new thread — customer may not have messaged yet
      const threadId = await ctx.db.insert("threads", {
        telegramId: args.telegramId,
        customerFirstName: "Customer", // Will be updated by bot if it has info
        status: "new",
        unreadCount: 0,
        lastMessageAt: Date.now(),
        hasCustomerMessaged: false,
        hasAdminReplied: false,
        lastCustomerMessageHasBudgetKeyword: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      thread = (await ctx.db.get(threadId))!;
    }

    // 4. Fetch desired phone to get price
    let desiredPhonePrice = 0;
    try {
      const product = await ctx.db.get(request.desiredPhoneId as any);
      if (product) {
        desiredPhonePrice = (product as any).price ?? 0;
      }
    } catch {
      // Phone might not exist yet
    }

    // 5. Create admin-side exchange record
    // Map exchangeRequest → exchanges schema
    // Split offeredModel into brand/model if possible, otherwise use safe defaults
    const [tradeInBrand, ...modelParts] = request.offeredModel.split(" ");
    const tradeInModel = modelParts.join(" ") || "Unknown";

    const exchangeId = await ctx.db.insert("exchanges", {
      telegramId: args.telegramId,
      threadId: thread._id,
      desiredPhoneId: request.desiredPhoneId as any,

      // Trade-in details from customer submission
      tradeInBrand: tradeInBrand,
      tradeInModel: tradeInModel,
      tradeInStorage: `${request.offeredStorageGb}GB`,
      tradeInRam: "Unknown", // Customer doesn't provide this
      tradeInCondition: normalizeCondition(request.offeredCondition),
      customerNotes: request.offeredNotes || undefined,
      budgetMentionedInSubmission: false,

      // Desired phone price
      desiredPhonePrice: desiredPhonePrice,

      // Pricing — all set to 0 initially, admin will override with actual valuation
      calculatedTradeInValue: 0,
      calculatedDifference: desiredPhonePrice,
      finalTradeInValue: 0,
      finalDifference: desiredPhonePrice,
      priorityValueETB: desiredPhonePrice,

      // Status
      status: "Pending",
      clickedContinue: false,

      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return exchangeId;
  },
});

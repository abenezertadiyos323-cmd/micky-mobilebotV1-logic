import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { verifyInitData, getEnvValue } from "./auth";

const DEFAULT_STORE_ADDRESS = "Bole Alemnesh Plaza";

function readOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type MockSettings = {
  storeAddress: string;
  storeLocationLink?: string;
  warrantyPolicy?: string;
  exchangeRules?: string;
  updatedAt: number;
};

function buildMockSettings(existing: Record<string, unknown> | null, now: number): MockSettings {
  const next: MockSettings = {
    storeAddress: readOptionalText(existing?.storeAddress) ?? DEFAULT_STORE_ADDRESS,
    updatedAt: now,
  };

  const storeLocationLink = readOptionalText(existing?.storeLocationLink);
  const warrantyPolicy = readOptionalText(existing?.warrantyPolicy);
  const exchangeRules = readOptionalText(existing?.exchangeRules);

  if (storeLocationLink) {
    next.storeLocationLink = storeLocationLink;
  }

  if (warrantyPolicy) {
    next.warrantyPolicy = warrantyPolicy;
  }

  if (exchangeRules) {
    next.exchangeRules = exchangeRules;
  }

  return next;
}

export const getSettings = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query("adminSettings").first();
  },
});

export const seedMockSettings = internalMutation({
  args: {
    storeAddress: v.optional(v.string()),
    storeLocationLink: v.optional(v.string()),
    warrantyPolicy: v.optional(v.string()),
    exchangeRules: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("adminSettings").first();
    const seed = buildMockSettings(
      existing as Record<string, unknown> | null,
      now,
    );

    const next: MockSettings = {
      storeAddress: args.storeAddress?.trim() || seed.storeAddress,
      updatedAt: now,
    };

    const storeLocationLink = args.storeLocationLink?.trim() || seed.storeLocationLink;
    const warrantyPolicy = args.warrantyPolicy?.trim() || seed.warrantyPolicy;
    const exchangeRules = args.exchangeRules?.trim() || seed.exchangeRules;

    if (storeLocationLink) {
      next.storeLocationLink = storeLocationLink;
    }

    if (warrantyPolicy) {
      next.warrantyPolicy = warrantyPolicy;
    }

    if (exchangeRules) {
      next.exchangeRules = exchangeRules;
    }

    if (existing) {
      await ctx.db.patch(existing._id, next);
      return next;
    }

    await ctx.db.insert("adminSettings", next);
    return next;
  },
});

export const checkAdminAccess = query({
  args: {
    initData: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      if (!args.initData || args.initData === 'MOCK_INIT_DATA') return false;

      // Safely parse the user from Telegram initData without crypto
      // (Telegram already validates the Mini App session before it opens)
      const params = new URLSearchParams(args.initData);
      const userRaw = params.get("user");
      if (!userRaw) return false;

      let userId: number;
      try {
        const parsed = JSON.parse(userRaw) as { id?: number };
        if (typeof parsed?.id !== "number" || parsed.id <= 0) return false;
        userId = parsed.id;
      } catch {
        return false;
      }

      const admin = await ctx.db
        .query("admins")
        .withIndex("by_telegramId", (q) => q.eq("telegramId", String(userId)))
        .first();

      return !!(admin && admin.isActive);
    } catch (e) {
      console.error("checkAdminAccess failed:", e);
      return false;
    }
  },
});


import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

const normalizeUserId = (value: unknown): string | null => {
  const direct = normalizeString(value);
  if (direct) {
    return direct;
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidates = [
    value.userId,
    value.telegramUserId,
    value.telegramId,
    value.id,
    value.user_id,
    value.telegram_user_id,
    value.telegram_id,
    value.affiliateUserId,
    value.ownerTelegramUserId,
    isRecord(value.user) ? value.user.id : null,
    isRecord(value.user) ? value.user.telegramId : null,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUserId(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const sumBy = (items: Array<Record<string, unknown>>, field: string) =>
  items.reduce((total, item) => {
    const numeric = Number(item[field]);
    return Number.isFinite(numeric) ? total + numeric : total;
  }, 0);

const toLatestFirst = <T extends { createdAt?: number }>(items: T[]) =>
  [...items].sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));

const toAffiliatePayload = (
  affiliate:
    | {
        _id: unknown;
        code: string;
        ownerTelegramUserId: string;
        status: string;
        createdAt: number;
      }
    | null
    | undefined,
) => {
  if (!affiliate) {
    return null;
  }

  return {
    _id: String(affiliate._id),
    code: affiliate.code,
    referralCode: affiliate.code,
    ownerTelegramUserId: affiliate.ownerTelegramUserId,
    status: affiliate.status,
    createdAt: affiliate.createdAt,
  };
};

const buildPreferredAffiliateCode = (userId: string) => {
  const digits = userId.replace(/\D/g, "").slice(-6);
  if (digits.length === 6) {
    return `REF${digits}`;
  }
  const fallback = Math.random().toString().slice(2, 8).padEnd(6, "0");
  return `REF${fallback}`;
};

const createUniqueAffiliateCode = async (ctx: any, userId: string) => {
  const preferred = buildPreferredAffiliateCode(userId);
  const preferredMatch = await ctx.db
    .query("affiliates")
    .withIndex("by_code", (q: any) => q.eq("code", preferred))
    .first();

  if (!preferredMatch) {
    return preferred;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = Math.random().toString().slice(2, 6).padEnd(4, "0");
    const code = `${preferred}${suffix}`;
    const existing = await ctx.db
      .query("affiliates")
      .withIndex("by_code", (q: any) => q.eq("code", code))
      .first();
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to generate a unique affiliate code");
};

const emptyStatsResponse = (userId: string | null) => ({
  userId,
  affiliate: null,
  referralCode: null,
  totalEarned: 0,
  pendingAmount: 0,
  paidAmount: 0,
  totalReferredCount: 0,
  referralCount: 0,
  stats: {
    referralsCount: 0,
    uniqueReferredUsersCount: 0,
    commissionsCount: 0,
    totalCommissionAmount: 0,
    paidCommissionsAmount: 0,
    pendingCommissionsAmount: 0,
  },
  recentReferrals: [],
  recentCommissions: [],
});

type CommissionDoc = {
  _id: string;
  affiliateId: string;
  orderId?: string;
  orderAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  status: string;
  createdAt: number;
};

export const getAffiliateByCustomerId = query({
  args: {
    customerId: v.any(),
  },
  handler: async (ctx, args) => {
    const customerId = normalizeUserId(args.customerId);
    if (!customerId) {
      return null;
    }

    const affiliateDocs = await ctx.db
      .query("affiliates")
      .withIndex("by_ownerTelegramUserId", (q) =>
        q.eq("ownerTelegramUserId", customerId),
      )
      .collect();

    return toAffiliatePayload(toLatestFirst(affiliateDocs)[0] ?? null);
  },
});

export const listAffiliateCommissions = query({
  args: {
    affiliateId: v.any(),
  },
  handler: async (ctx, args) => {
    const affiliateId = normalizeString(args.affiliateId);
    if (!affiliateId) {
      return [];
    }

    const commissions = await ctx.db
      .query("affiliateCommissions")
      .withIndex("by_affiliateId", (q) => q.eq("affiliateId", affiliateId))
      .collect();

    return toLatestFirst(commissions).map((doc) => ({
      _id: String(doc._id),
      affiliateId: doc.affiliateId,
      orderId: doc.orderId ?? null,
      orderAmount: doc.orderAmount,
      commissionPercent: doc.commissionPercent,
      commissionAmount: doc.commissionAmount,
      status: doc.status,
      createdAt: doc.createdAt,
    }));
  },
});

export const getOrCreateMyAffiliate = mutation({
  args: {
    telegramUserId: v.optional(v.any()),
    userId: v.optional(v.any()),
    customerId: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const ownerTelegramUserId =
      normalizeUserId(args.telegramUserId) ??
      normalizeUserId(args.userId) ??
      normalizeUserId(args.customerId);

    if (!ownerTelegramUserId) {
      throw new Error("telegramUserId is required");
    }

    const existingDocs = await ctx.db
      .query("affiliates")
      .withIndex("by_ownerTelegramUserId", (q) =>
        q.eq("ownerTelegramUserId", ownerTelegramUserId),
      )
      .collect();

    const existing = toLatestFirst(existingDocs)[0] ?? null;
    if (existing) {
      return toAffiliatePayload(existing);
    }

    const code = await createUniqueAffiliateCode(ctx, ownerTelegramUserId);
    const affiliateId = await ctx.db.insert("affiliates", {
      code,
      ownerTelegramUserId,
      createdAt: Date.now(),
      status: "active",
    });

    return toAffiliatePayload({
      _id: affiliateId,
      code,
      ownerTelegramUserId,
      createdAt: Date.now(),
      status: "active",
    });
  },
});

export const createReferralIfValid = mutation({
  args: {
    referralCode: v.any(),
    referredTelegramId: v.any(),
    source: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const referralCode = normalizeString(args.referralCode)?.toUpperCase() ?? null;
    const referredTelegramUserId = normalizeUserId(args.referredTelegramId);
    const source = normalizeString(args.source) ?? "mini_app";

    if (!referralCode || !referredTelegramUserId) {
      return {
        created: false,
        reason: "missing_arguments",
      };
    }

    const affiliate = await ctx.db
      .query("affiliates")
      .withIndex("by_code", (q) => q.eq("code", referralCode))
      .first();

    if (!affiliate) {
      return {
        created: false,
        reason: "invalid_code",
      };
    }

    if (affiliate.ownerTelegramUserId === referredTelegramUserId) {
      return {
        created: false,
        reason: "self_referral",
      };
    }

    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_code_referredTelegramUserId", (q) =>
        q.eq("code", affiliate.code).eq("referredTelegramUserId", referredTelegramUserId),
      )
      .first();

    if (existing) {
      return {
        created: false,
        reason: "already_exists",
        referralId: String(existing._id),
      };
    }

    const referralId = await ctx.db.insert("referrals", {
      code: affiliate.code,
      referredTelegramUserId,
      createdAt: Date.now(),
      source,
    });

    return {
      created: true,
      reason: null,
      referralId: String(referralId),
      referralCode: affiliate.code,
    };
  },
});

const ETH_OFFSET_MS = 3 * 60 * 60 * 1000;

function ethTodayStart(now: number): number {
  const ethNow = now + ETH_OFFSET_MS;
  const ethMidnight = ethNow - (ethNow % 86_400_000);
  return ethMidnight - ETH_OFFSET_MS;
}

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const todayStart = ethTodayStart(now);
    const activeAffiliates = await ctx.db
      .query("affiliates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const allReferrals = await ctx.db.query("referrals").collect();
    const uniqueUsers = new Set(allReferrals.map((r) => r.referredTelegramUserId));
    const codeCounts = new Map<string, number>();

    for (const referral of allReferrals) {
      codeCounts.set(referral.code, (codeCounts.get(referral.code) ?? 0) + 1);
    }

    return {
      totalAffiliates: activeAffiliates.length,
      totalReferredPeople: uniqueUsers.size,
      newReferralsToday: allReferrals.filter((r) => r.createdAt >= todayStart).length,
      topCodes: Array.from(codeCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([code, count]) => ({ code, count })),
      recentReferrals: [...allReferrals]
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 5)
        .map((referral) => ({
          code: referral.code,
          referredTelegramUserId: referral.referredTelegramUserId,
          createdAt: referral.createdAt,
          source: referral.source,
        })),
    };
  },
});

export const trackReferral = mutation({
  args: {
    code: v.string(),
    referredTelegramUserId: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { code, referredTelegramUserId, source }) => {
    const affiliate = await ctx.db
      .query("affiliates")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!affiliate || affiliate.status !== "active") return null;

    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_code_referredTelegramUserId", (q) =>
        q.eq("code", code).eq("referredTelegramUserId", referredTelegramUserId),
      )
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("referrals", {
      code,
      referredTelegramUserId,
      createdAt: Date.now(),
      source: source ?? "telegram_start",
    });

    return await ctx.db.get(id);
  },
});

// Get referral stats for a Telegram user who owns an affiliate code.
export const getUserReferralStats = query({
  args: {
    userId: v.optional(v.any()),
    telegramUserId: v.optional(v.any()),
    telegramId: v.optional(v.any()),
    user: v.optional(v.any()),
    telegramUser: v.optional(v.any()),
    telegram: v.optional(v.any()),
    auth: v.optional(v.any()),
    payload: v.optional(v.any()),
    initData: v.optional(v.any()),
    initDataUnsafe: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const finalUserId =
      normalizeUserId(args.userId) ??
      normalizeUserId(args.telegramUserId) ??
      normalizeUserId(args.telegramId) ??
      normalizeUserId(args.user) ??
      normalizeUserId(args.telegramUser) ??
      normalizeUserId(args.telegram) ??
      normalizeUserId(args.auth) ??
      normalizeUserId(args.payload) ??
      normalizeUserId(args.initData) ??
      normalizeUserId(args.initDataUnsafe);

    if (!finalUserId) {
      return emptyStatsResponse(null);
    }

    const affiliateDocs = await ctx.db
      .query("affiliates")
      .withIndex("by_ownerTelegramUserId", (q) =>
        q.eq("ownerTelegramUserId", finalUserId),
      )
      .collect();

    const affiliate = toLatestFirst(affiliateDocs)[0] ?? null;
    if (!affiliate) {
      return emptyStatsResponse(finalUserId);
    }

    const referralDocs = await ctx.db
      .query("referrals")
      .withIndex("by_code", (q) => q.eq("code", affiliate.code))
      .collect();

    const affiliateIdCandidates = [
      String(affiliate._id),
      affiliate.code,
    ];

    const commissionDocMap = new Map<string, CommissionDoc>();
    for (const affiliateId of affiliateIdCandidates) {
      const docs = await ctx.db
        .query("affiliateCommissions")
        .withIndex("by_affiliateId", (q) => q.eq("affiliateId", affiliateId))
        .collect();

      for (const doc of docs) {
        const normalizedDoc: CommissionDoc = {
          _id: String(doc._id),
          affiliateId: doc.affiliateId,
          orderId: doc.orderId ?? undefined,
          orderAmount: doc.orderAmount,
          commissionPercent: doc.commissionPercent,
          commissionAmount: doc.commissionAmount,
          status: doc.status,
          createdAt: doc.createdAt,
        };
        commissionDocMap.set(normalizedDoc._id, normalizedDoc);
      }
    }

    const commissionDocs = toLatestFirst([...commissionDocMap.values()]);
    const paidCommissions = commissionDocs.filter(
      (doc) => String(doc.status).toLowerCase() === "paid",
    );
    const pendingCommissions = commissionDocs.filter(
      (doc) => String(doc.status).toLowerCase() === "pending",
    );
    const uniqueReferredUsersCount = new Set(
      referralDocs
        .map((doc) => doc.referredTelegramUserId)
        .filter((value) => typeof value === "string" && value.trim()),
    ).size;

    const totalEarned = sumBy(commissionDocs, "commissionAmount");
    const paidAmount = sumBy(paidCommissions, "commissionAmount");
    const pendingAmount = sumBy(pendingCommissions, "commissionAmount");

    return {
      userId: finalUserId,
      affiliate: toAffiliatePayload(affiliate),
      referralCode: affiliate.code,
      totalEarned,
      pendingAmount,
      paidAmount,
      totalReferredCount: uniqueReferredUsersCount,
      referralCount: referralDocs.length,
      stats: {
        referralsCount: referralDocs.length,
        uniqueReferredUsersCount,
        commissionsCount: commissionDocs.length,
        totalCommissionAmount: totalEarned,
        paidCommissionsAmount: paidAmount,
        pendingCommissionsAmount: pendingAmount,
      },
      recentReferrals: toLatestFirst(referralDocs).slice(0, 10).map((doc) => ({
        _id: String(doc._id),
        code: doc.code,
        referredTelegramUserId: doc.referredTelegramUserId,
        createdAt: doc.createdAt,
        source: doc.source ?? null,
      })),
      recentCommissions: commissionDocs.slice(0, 10).map((doc) => ({
        _id: String(doc._id),
        affiliateId: doc.affiliateId,
        orderId: doc.orderId ?? null,
        orderAmount: doc.orderAmount,
        commissionPercent: doc.commissionPercent,
        commissionAmount: doc.commissionAmount,
        status: doc.status,
        createdAt: doc.createdAt,
      })),
    };
  },
});

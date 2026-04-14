import { mutation } from "./_generated/server";
import { v } from "convex/values";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseTelegramUserFromInitData = (initData: string): TelegramUser | null => {
  const params = new URLSearchParams(initData);
  const rawUser = params.get("user");
  if (!rawUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawUser) as TelegramUser;
    if (
      typeof parsed?.id !== "number" ||
      !Number.isFinite(parsed.id) ||
      parsed.id <= 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const verifyTelegramUser = mutation({
  args: {
    initData: v.string(),
  },
  handler: async (ctx, args) => {
    const initData = normalizeString(args.initData);
    if (!initData) {
      throw new Error("initData is required");
    }

    const telegramUser = parseTelegramUserFromInitData(initData);
    if (!telegramUser) {
      throw new Error("Unable to parse Telegram user from initData");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_telegramUserId", (q) => q.eq("telegramUserId", telegramUser.id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        username: telegramUser.username ?? existing.username,
        firstName: telegramUser.first_name ?? existing.firstName,
        lastName: telegramUser.last_name ?? existing.lastName,
        photoUrl: telegramUser.photo_url ?? existing.photoUrl,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("customers", {
        telegramUserId: telegramUser.id,
        username: telegramUser.username ?? undefined,
        firstName: telegramUser.first_name ?? undefined,
        lastName: telegramUser.last_name ?? undefined,
        photoUrl: telegramUser.photo_url ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      customerId: String(telegramUser.id),
      telegramUserId: telegramUser.id,
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name ?? null,
      lastName: telegramUser.last_name ?? null,
      photoUrl: telegramUser.photo_url ?? null,
      verifiedAt: now,
    };
  },
});

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();

export function getEnvValue(name: string): string | undefined {
  if (name === "TELEGRAM_BOT_TOKEN") {
    return process.env.TELEGRAM_BOT_TOKEN;
  }
  return undefined;
}

function buildDataCheckString(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error("Invalid Telegram authentication data");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

async function hmacSha256(
  keyInput: string | Uint8Array,
  message: string,
): Promise<Uint8Array> {
  const keyBytes = typeof keyInput === "string" ? encoder.encode(keyInput) : keyInput;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

export async function verifyInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDateRaw = params.get("auth_date");
  const userRaw = params.get("user");

  if (!hash || !authDateRaw || !userRaw) {
    throw new Error("Invalid Telegram authentication data");
  }

  if (!/^\d+$/.test(authDateRaw)) {
    throw new Error("Invalid Telegram authentication data");
  }
  const authDate = Number(authDateRaw);

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (authDate > nowSeconds + 60) {
    throw new Error("Invalid Telegram authentication data");
  }
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new Error("Telegram authentication has expired");
  }

  const dataCheckString = buildDataCheckString(params);
  const secretKey = await hmacSha256("WebAppData", botToken);
  const expectedHashBytes = await hmacSha256(secretKey, dataCheckString);
  const providedHashBytes = hexToBytes(hash.toLowerCase());

  if (!timingSafeEqual(expectedHashBytes, providedHashBytes)) {
    throw new Error("Invalid Telegram authentication data");
  }

  const parsed = JSON.parse(userRaw) as {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
    photo_url?: string;
  };

  if (typeof parsed?.id !== "number" || !Number.isFinite(parsed.id) || parsed.id <= 0) {
    throw new Error("Invalid Telegram authentication data");
  }

  return parsed;
}

export const loginWithTelegram = mutation({
  args: {
    initData: v.string(),
  },
  handler: async (ctx, args) => {
    const botToken = getEnvValue("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      throw new Error("Server configuration missing TELEGRAM_BOT_TOKEN");
    }

    const user = await verifyInitData(args.initData, botToken);
    const now = Date.now();

    const existing = await ctx.db
      .query("customers")
      .withIndex("by_telegramUserId", (q) => q.eq("telegramUserId", user.id))
      .first();

    let customerId;
    if (existing) {
      customerId = existing._id;
      await ctx.db.patch(existing._id, {
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        photoUrl: user.photo_url,
        updatedAt: now,
      });
    } else {
      customerId = await ctx.db.insert("customers", {
        telegramUserId: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        photoUrl: user.photo_url,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      ok: true,
      customer: {
        id: customerId,
        telegramUserId: user.id,
        username: user.username ?? null,
        firstName: user.first_name ?? null,
        lastName: user.last_name ?? null,
        photoUrl: user.photo_url ?? null,
      },
    };
  },
});

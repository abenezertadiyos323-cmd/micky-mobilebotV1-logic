import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

type ProductRecord = Record<string, unknown>;

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeTermKey = (value: unknown) => {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
};

const readStringField = (record: ProductRecord, keys: string[]) => {
  for (const key of keys) {
    const value = normalizeText(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
};

const readNumberField = (record: ProductRecord, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }
  return null;
};

const readBooleanField = (record: ProductRecord, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
};

const extractStorageValue = (value: unknown) => {
  const storage = normalizeText(value);
  if (!storage) {
    return null;
  }

  const numeric = Number(storage.replace(/[^0-9]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : storage;
};

const toSearchableName = (product: ProductRecord) =>
  readStringField(product, ["phoneType", "name", "title", "model"]);

const splitBrandAndModel = (brand: string | null, name: string | null) => {
  if (!name) {
    return {
      brand,
      model: null as string | null,
    };
  }

  if (!brand) {
    const parts = name.split(/\s+/);
    if (parts.length <= 1) {
      return { brand: null, model: name };
    }
    return {
      brand: parts[0],
      model: parts.slice(1).join(" "),
    };
  }

  const normalizedBrand = brand.toLowerCase();
  const normalizedName = name.toLowerCase();
  if (normalizedName.startsWith(normalizedBrand)) {
    const model = name.slice(brand.length).trim();
    return {
      brand,
      model: model || name,
    };
  }

  return {
    brand,
    model: name,
  };
};

const pickMainImage = (product: ProductRecord) => {
  const direct = readStringField(product, ["main_image_url", "image"]);
  if (direct) {
    return direct;
  }

  if (Array.isArray(product.images)) {
    const first = product.images.find(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
    if (typeof first === "string") {
      return first.trim();
    }
  }

  return null;
};

const toPublicSearchProduct = (product: ProductRecord) => {
  const phoneType = toSearchableName(product);
  const brand = readStringField(product, ["brand"]);
  const { brand: resolvedBrand, model } = splitBrandAndModel(brand, phoneType);
  const price = readNumberField(product, ["price", "price_etb"]) ?? 0;

  return {
    _id: String(product._id ?? product.id ?? product.product_id ?? product.sku ?? ""),
    id: String(product._id ?? product.id ?? product.product_id ?? product.sku ?? ""),
    phoneType:
      phoneType ?? ([resolvedBrand, model].filter(Boolean).join(" ").trim() || "Phone"),
    brand: resolvedBrand,
    model,
    storage: extractStorageValue(product.storage),
    condition: readStringField(product, ["condition"]),
    price,
    mainImageUrl: pickMainImage(product),
    exchange_available:
      readBooleanField(product, ["exchange_available", "exchangeEnabled"]) ?? false,
    in_stock: readBooleanField(product, ["in_stock", "inStock"]) ??
      ((readNumberField(product, ["stockQuantity", "stock_quantity"]) ?? 0) > 0),
  };
};

const buildTermCounts = (terms: string[]) => {
  const counts = new Map<string, { term: string; count: number }>();
  for (const term of terms) {
    const key = normalizeTermKey(term);
    if (!key) {
      continue;
    }
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(key, {
      term: term.trim(),
      count: 1,
    });
  }
  return [...counts.values()].sort((left, right) => right.count - left.count);
};

const formatSearchChip = (item: { term: string; count: number }) => ({
  term: item.term,
  label: item.term,
  count: item.count,
});

export const logSearch = mutation({
  args: {
    userId: v.optional(v.any()),
    term: v.string(),
  },
  handler: async (ctx, args) => {
    const term = normalizeText(args.term);
    if (!term) {
      return null;
    }

    const userId = normalizeText(args.userId);
    return ctx.db.insert("searches", {
      userId: userId ?? undefined,
      term,
      createdAt: Date.now(),
    });
  },
});

export const getSearchPanelData = query({
  args: {
    limit: v.optional(v.number()),
    topDays: v.optional(v.number()),
    trendingHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
        ? Math.floor(args.limit)
        : 8;
    const topDays =
      typeof args.topDays === "number" && Number.isFinite(args.topDays) && args.topDays > 0
        ? args.topDays
        : 30;
    const trendingHours =
      typeof args.trendingHours === "number" &&
      Number.isFinite(args.trendingHours) &&
      args.trendingHours > 0
        ? args.trendingHours
        : 48;

    const now = Date.now();
    const searches = await ctx.db.query("searches").collect();
    const allTerms = searches.map((search) => search.term);
    const topTerms = buildTermCounts(
      searches
        .filter((search) => now - search.createdAt <= topDays * 24 * 60 * 60 * 1000)
        .map((search) => search.term),
    );
    const trendingTerms = buildTermCounts(
      searches
        .filter((search) => now - search.createdAt <= trendingHours * 60 * 60 * 1000)
        .map((search) => search.term),
    );
    const fallbackTerms = buildTermCounts(allTerms);

    if (fallbackTerms.length === 0) {
      const products: ProductRecord[] = await ctx.db.query("products").collect();
      for (const product of products) {
        if (product.isArchived === true) {
          continue;
        }
        const name = toSearchableName(product);
        if (!name) {
          continue;
        }
        fallbackTerms.push({ term: name, count: 1 });
      }
    }

    const hotSearches = (topTerms.length > 0 ? topTerms : fallbackTerms)
      .slice(0, limit)
      .map(formatSearchChip);
    const topSearches = (topTerms.length > 0 ? topTerms : fallbackTerms)
      .slice(0, limit)
      .map(formatSearchChip);
    const trendingSearches = (trendingTerms.length > 0 ? trendingTerms : fallbackTerms)
      .slice(0, limit)
      .map(formatSearchChip);

    return {
      hot_searches: hotSearches,
      top_searches: topSearches,
      trending_searches: trendingSearches,
    };
  },
});

export const searchProducts = query({
  args: {
    term: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const term = normalizeTermKey(args.term);
    if (!term) {
      return [];
    }

    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
        ? Math.floor(args.limit)
        : 8;

    const products: ProductRecord[] = await ctx.db.query("products").collect();
    const matches = products
      .filter((product) => product.isArchived !== true)
      .map((product) => toPublicSearchProduct(product))
      .filter((product) => {
        const haystack = [
          product.phoneType,
          product.brand,
          product.model,
          String(product.storage ?? ""),
          product.condition,
        ]
          .filter((value) => typeof value === "string" && value.trim())
          .join(" ")
          .toLowerCase();

        return haystack.includes(term);
      })
      .sort((left, right) => {
        const stockOrder = Number(right.in_stock) - Number(left.in_stock);
        if (stockOrder !== 0) {
          return stockOrder;
        }
        return left.price - right.price;
      });

    return matches.slice(0, limit);
  },
});

export const listRecentSearches = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db.query("searches").order("desc").take(limit);
  },
});

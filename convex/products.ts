import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Product } from "./types";
import { hasStorageGb, normalizeProductStorage } from "./lib/productStorage";

const constraintFields = {
  brand: v.optional(v.string()),
  model: v.optional(v.string()),
  storage: v.optional(v.string()),
  condition: v.optional(v.string()),
  budget_etb: v.optional(v.number()),
};

type ProductRecord = Record<string, unknown>;

type ProductSearchConstraints = {
  brand?: string;
  model?: string;
  storage?: string;
  condition?: string;
  budget_etb?: number;
};

type ProductSelectionSnapshot = Pick<
  Product,
  "id" | "name" | "sellerId" | "storage" | "price" | "inStock"
> & {
  _id: unknown | null;
  brand: Product["brand"] | string | null;
  model: string | null;
  condition: Product["condition"] | string | null;
  price_etb: number | null;
  in_stock: boolean;
  stockQuantity: number | null;
  images: unknown[];
  type: string;
  createdAt: number;
};

type SellerIdCoverage = {
  totalCount: number;
  matchingSellerIdCount: number;
  missingSellerIdCount: number;
  otherSellerIdCount: number;
};

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function normalizeModel(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  let compact = "";
  for (const char of normalized) {
    if (char !== " " && char !== "-" && char !== "_") {
      compact += char;
    }
  }

  return compact || null;
}

function readStringField(product: ProductRecord, keys: string[]) {
  for (const key of keys) {
    const value = product[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumberField(product: ProductRecord, keys: string[]) {
  for (const key of keys) {
    const value = product[key];

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
}

function readBooleanField(product: ProductRecord, keys: string[]) {
  for (const key of keys) {
    const value = product[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function readProductModel(product: ProductRecord) {
  return readStringField(product, ["model", "phoneType", "name", "title"]);
}

function readPriceEtb(product: ProductRecord) {
  return readNumberField(product, ["price_etb", "price"]);
}

function readStockQuantity(product: ProductRecord) {
  return readNumberField(product, ["stockQuantity", "stock_quantity"]);
}

function readInStock(product: ProductRecord) {
  const explicit = readBooleanField(product, ["in_stock", "inStock"]);
  if (explicit !== null) {
    return explicit;
  }

  const stockQuantity = readStockQuantity(product);
  return stockQuantity !== null ? stockQuantity > 0 : false;
}

function toSelectionSnapshot(product: ProductRecord): ProductSelectionSnapshot {
  const model = readProductModel(product);
  const price_etb = readPriceEtb(product);
  const stockQuantity = readStockQuantity(product);
  const in_stock = readInStock(product);
  const sellerId = readStringField(product, ["sellerId", "seller_id"]) ?? "";
  const storage = readStringField(product, ["storage"]) ?? "";
  const name =
    readStringField(product, ["name", "title", "phoneType", "model"]) ?? "";
  const type = readStringField(product, ["type"]) ?? "phone";

  return {
    id: String(product._id ?? product.id ?? product.product_id ?? product.sku ?? ""),
    _id: product._id ?? null,
    name,
    sellerId,
    brand: readStringField(product, ["brand"]),
    model,
    storage,
    condition: readStringField(product, ["condition"]),
    price: price_etb ?? 0,
    price_etb,
    inStock: in_stock,
    in_stock,
    stockQuantity,
    images: Array.isArray(product.images) ? product.images : [],
    type,
    createdAt: typeof product.createdAt === "number" ? product.createdAt : (product._creationTime ?? 0),
  };
}

function toPublicProduct(product: ProductSelectionSnapshot) {
  return {
    id: product.id,
    _id: product._id,
    sellerId: product.sellerId,
    brand: product.brand,
    model: product.model,
    phoneType: product.model,
    storage: product.storage,
    condition: product.condition,
    price_etb: product.price_etb,
    price: product.price_etb,
    in_stock: product.in_stock,
    stockQuantity: product.stockQuantity,
    images: product.images,
    type: product.type,
  };
}

async function getSellerIdCoverage(
  ctx: any,
  expectedSellerId: string,
): Promise<SellerIdCoverage> {
  const normalizedExpectedSellerId = normalizeText(expectedSellerId);
  const products: ProductRecord[] = await ctx.db.query("products").collect();

  let matchingSellerIdCount = 0;
  let missingSellerIdCount = 0;
  let otherSellerIdCount = 0;

  for (const product of products) {
    const currentSellerId = normalizeText(
      readStringField(product, ["sellerId", "seller_id"]),
    );

    if (!currentSellerId) {
      missingSellerIdCount += 1;
      continue;
    }

    if (currentSellerId === normalizedExpectedSellerId) {
      matchingSellerIdCount += 1;
      continue;
    }

    otherSellerIdCount += 1;
  }

  return {
    totalCount: products.length,
    matchingSellerIdCount,
    missingSellerIdCount,
    otherSellerIdCount,
  };
}

async function runProductSearch(
  ctx: any,
  sellerId: string,
  constraints: ProductSearchConstraints,
) {
  const normalizedSellerId = normalizeText(sellerId);
  if (!normalizedSellerId) {
    return { products: [], count: 0 };
  }

  const brand = normalizeText(constraints.brand);
  const model = normalizeText(constraints.model);
  const modelKey = normalizeModel(constraints.model);
  const storage = normalizeText(constraints.storage);
  const condition = normalizeText(constraints.condition);
  const budget_etb =
    typeof constraints.budget_etb === "number" &&
    Number.isFinite(constraints.budget_etb)
      ? constraints.budget_etb
      : null;

  let results: ProductRecord[] = await ctx.db.query("products").collect();

  let snapshots = results.map((product: ProductRecord) => toSelectionSnapshot(product));

  snapshots = snapshots.filter(
    (product: ProductSelectionSnapshot) =>
      normalizeText(product.sellerId) === normalizedSellerId,
  );

  if (brand) {
    snapshots = snapshots.filter(
      (product: ProductSelectionSnapshot) => normalizeText(product.brand) === brand,
    );
  }

  if (model) {
    snapshots = snapshots.filter((product: ProductSelectionSnapshot) => {
      const productModel = product.model;
      return (
        normalizeText(productModel) === model ||
        normalizeModel(productModel) === modelKey
      );
    });
  }

  if (storage) {
    snapshots = snapshots.filter(
      (product: ProductSelectionSnapshot) => normalizeText(product.storage) === storage,
    );
  }

  if (condition) {
    snapshots = snapshots.filter(
      (product: ProductSelectionSnapshot) => normalizeText(product.condition) === condition,
    );
  }

  if (budget_etb !== null) {
    snapshots = snapshots.filter(
      (product: ProductSelectionSnapshot) =>
        product.price_etb !== null && product.price_etb <= budget_etb,
    );
  }

  snapshots.sort((left: ProductSelectionSnapshot, right: ProductSelectionSnapshot) => {
    const stockOrder = Number(right.inStock) - Number(left.inStock);
    if (stockOrder !== 0) {
      return stockOrder;
    }

    const leftPrice = left.price_etb ?? Number.MAX_SAFE_INTEGER;
    const rightPrice = right.price_etb ?? Number.MAX_SAFE_INTEGER;
    return leftPrice - rightPrice;
  });

  const products = snapshots
    .slice(0, 5)
    .map((product: ProductSelectionSnapshot) => toPublicProduct(product));
  return {
    products,
    count: products.length,
  };
}

export const search = internalQuery({
  args: {
    sellerId: v.string(),
    constraints: v.optional(v.object(constraintFields)),
  },
  handler: async (ctx, args) => {
    return runProductSearch(ctx, args.sellerId, args.constraints ?? {});
  },
});

export const listAllProducts = query({
  args: {
    sellerId: v.optional(v.string()),
    includeOutOfStock: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const includeOutOfStock = args.includeOutOfStock ?? true;
    const normalizedSellerId = normalizeText(args.sellerId);
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
        ? Math.floor(args.limit)
        : null;

    const products: ProductRecord[] = await ctx.db.query("products").collect();

    let snapshots = products
      .filter((p) => (p as { isArchived?: boolean }).isArchived !== true)
      .map((product: ProductRecord) => toSelectionSnapshot(product));

    if (normalizedSellerId) {
      snapshots = snapshots.filter(
        (product: ProductSelectionSnapshot) =>
          normalizeText(product.sellerId) === normalizedSellerId,
      );
    }

    if (!includeOutOfStock) {
      snapshots = snapshots.filter((product: ProductSelectionSnapshot) => product.inStock);
    }

    snapshots.sort((left: ProductSelectionSnapshot, right: ProductSelectionSnapshot) => {
      const stockOrder = Number(right.inStock) - Number(left.inStock);
      if (stockOrder !== 0) {
        return stockOrder;
      }

      return right.createdAt - left.createdAt;
    });

    const publicProducts = await Promise.all(
      snapshots.map(async (product: ProductSelectionSnapshot) => {
        const images = await normalizeImageUrls(ctx, product.images);
        const p = toPublicProduct(product);
        return {
          ...p,
          images,
          is_accessory: p.type === "accessory",
          main_image_url: images[0] ?? "",
          inStock: p.in_stock
        };
      }),
    );

    return limit === null ? publicProducts : publicProducts.slice(0, limit);
  },
});

export const backfillLegacySellerId = mutation({
  args: {
    sellerId: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedSellerId = args.sellerId.trim();
    const products: ProductRecord[] = await ctx.db.query("products").collect();
    let updatedCount = 0;

    for (const product of products) {
      const currentSellerId = readStringField(product, ["sellerId", "seller_id"]);
      if (currentSellerId) {
        continue;
      }

      await ctx.db.patch((product as { _id: any })._id, {
        sellerId: normalizedSellerId,
      });
      updatedCount += 1;
    }

    return {
      sellerId: normalizedSellerId,
      updatedCount,
      coverage: await getSellerIdCoverage(ctx, normalizedSellerId),
    };
  },
});

export const verifySellerIdCoverage = query({
  args: {
    sellerId: v.string(),
  },
  handler: async (ctx, args) => {
    return getSellerIdCoverage(ctx, args.sellerId);
  },
});

const vProductType = v.union(v.literal("phone"), v.literal("accessory"));

const vCondition = v.union(
  v.literal("New"),
  v.literal("Like New"),
  v.literal("Excellent"),
  v.literal("Good"),
  v.literal("Fair"),
  v.literal("Poor"),
);

const vStorageOption = v.union(
  v.literal("32GB"),
  v.literal("64GB"),
  v.literal("128GB"),
  v.literal("256GB"),
  v.literal("512GB"),
  v.literal("1TB"),
);

type ProductType = "phone" | "accessory";

function normalizeExchangeEnabled(type: ProductType, exchangeEnabled: boolean) {
  return type === "phone" ? exchangeEnabled : false;
}

function buildSearchText(p: {
  phoneType?: string;
  storage?: string;
  ram?: string;
  condition?: string;
}): string {
  return [p.phoneType, p.storage, p.ram, p.condition]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchNormalized(p: {
  phoneType?: string;
  storage?: string;
  ram?: string;
  condition?: string;
}): string {
  return [p.phoneType, p.storage, p.ram, p.condition]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

const vImageInput = v.string();

type StorageCtx = {
  storage: {
    getUrl: (id: string) => Promise<string | null>;
  };
};

type LegacyImage = {
  storageId: string;
  order?: number;
  url?: string;
};

const trimImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sanitizeImageUrls = (images: string[]): string[] => {
  const cleaned = images
    .map((img) => trimImageUrl(img))
    .filter((img): img is string => img !== null);
  return cleaned.slice(0, 3);
};

function asLegacyImage(value: unknown): LegacyImage | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<LegacyImage>;
  if (typeof maybe.storageId !== "string" || maybe.storageId.length === 0) {
    return null;
  }
  return {
    storageId: maybe.storageId,
    order: typeof maybe.order === "number" ? maybe.order : undefined,
    url: typeof maybe.url === "string" ? maybe.url : undefined,
  };
}

async function normalizeImageUrls(
  ctx: StorageCtx,
  images: unknown,
): Promise<string[]> {
  if (!Array.isArray(images) || images.length === 0) return [];

  const normalized = images
    .map((img, index) => {
      const directUrl = trimImageUrl(img);
      if (directUrl) {
        return { kind: "url" as const, order: index, value: directUrl };
      }
      const legacy = asLegacyImage(img);
      if (legacy) {
        return {
          kind: "legacy" as const,
          order: legacy.order ?? index,
          storageId: legacy.storageId,
          fallbackUrl: trimImageUrl(legacy.url),
        };
      }
      return null;
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

  return sanitizeImageUrls(urls);
}

const LOW_STOCK_THRESHOLD = 2;

type AdminSettings = {
  phoneLowStockThreshold?: number;
  accessoryLowStockThreshold?: number;
};

function resolveThreshold(
  p: { lowStockThreshold?: number; type: string },
  settings: AdminSettings | null,
): number {
  if (p.lowStockThreshold != null) return p.lowStockThreshold;
  if (settings) {
    if (p.type === "phone" && settings.phoneLowStockThreshold != null) {
      return settings.phoneLowStockThreshold;
    }
    if (p.type === "accessory" && settings.accessoryLowStockThreshold != null) {
      return settings.accessoryLowStockThreshold;
    }
  }
  return LOW_STOCK_THRESHOLD;
}

const normalizeTab = (tab?: string) => {
  switch (tab) {
    case "all":
      return "all";
    case "in_stock":
    case "inStock":
      return "in_stock";
    case "low_stock":
    case "lowStock":
      return "low_stock";
    case "out_of_stock":
    case "outOfStock":
      return "out_of_stock";
    case "exchange":
    case "exchangeEnabled":
      return "exchange";
    case "archived":
      return "archived";
    default:
      return "all";
  }
};

const normalizeType = (type?: string): ProductType | undefined => {
  if (type === "phone" || type === "accessory") {
    return type;
  }
  return undefined;
};

export const listProducts = query({
  args: {
    tab: v.optional(v.string()),
    type: v.optional(v.string()),
    brand: v.optional(v.string()),
    search: v.optional(v.string()),
    condition: v.optional(vCondition),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
    hasImages: v.optional(v.boolean()),
    storageGb: v.optional(v.number()),
    ramGb: v.optional(v.number()),
    q: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
    lowStockOnly: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { tab, type, brand, search, condition, priceMin, priceMax, hasImages, storageGb, ramGb, q, includeArchived, lowStockOnly },
  ) => {
    const adminSettingsDocs = await ctx.db.query("adminSettings").collect();
    const adminSettings: AdminSettings | null = adminSettingsDocs[0] ?? null;

    const normalizedTab = normalizeTab(tab);
    const resolvedType = normalizeType(type);
    const includeArchivedLegacy = !tab && includeArchived === true;
    const normalizedSearch = (search ?? q)?.toLowerCase().replace(/\s+/g, " ").trim();
    const isArchivedTab = normalizedTab === "archived";

    let indexedProducts;
    if (normalizedTab === "exchange") {
      indexedProducts = await ctx.db
        .query("products")
        .withIndex("by_isArchived_exchangeEnabled_createdAt", (qb) =>
          qb.eq("isArchived", false).eq("exchangeEnabled", true),
        )
        .order("desc")
        .collect();
    } else {
      indexedProducts = await ctx.db
        .query("products")
        .withIndex("by_isArchived_createdAt", (qb) =>
          tab
            ? qb.eq("isArchived", isArchivedTab)
            : includeArchivedLegacy
              ? qb.gte("isArchived", false)
              : qb.eq("isArchived", false),
        )
        .order("desc")
        .collect();
    }

    const legacyProducts = (await ctx.db.query("products").collect())
      .filter((p) => (p as { isArchived?: boolean }).isArchived === undefined)
      .map((p) => ({ ...p, isArchived: false }));

    const merged = [...indexedProducts, ...legacyProducts];
    const deduped = Array.from(new Map(merged.map((p) => [p._id, p])).values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );

    let products =
      normalizedTab === "archived"
        ? deduped.filter((p) => p.isArchived === true)
        : includeArchivedLegacy
          ? deduped
          : deduped.filter((p) => p.isArchived === false);

    if (normalizedTab === "in_stock") {
      products = products.filter((p) => p.stockQuantity > 0);
    } else if (normalizedTab === "out_of_stock") {
      products = products.filter((p) => p.stockQuantity === 0);
    } else if (normalizedTab === "low_stock") {
      products = products.filter(
        (p) => p.stockQuantity > 0 && p.stockQuantity <= resolveThreshold(p, adminSettings),
      );
    } else if (normalizedTab === "exchange") {
      products = products.filter((p) => p.exchangeEnabled === true);
    }

    if (!tab && lowStockOnly) {
      products = products.filter((p) => p.stockQuantity <= resolveThreshold(p, adminSettings));
    }

    if (resolvedType) products = products.filter((p) => p.type === resolvedType);
    if (brand) {
      const normalizedBrand = brand.toLowerCase();
      products = products.filter((p) => {
        const legacyBrand = (p as unknown as { brand?: string }).brand;
        return legacyBrand?.toLowerCase() === normalizedBrand;
      });
    }
    if (condition) products = products.filter((p) => p.condition === condition);
    if (priceMin !== undefined) products = products.filter((p) => p.price >= priceMin);
    if (priceMax !== undefined) products = products.filter((p) => p.price <= priceMax);
    if (hasImages) products = products.filter((p) => Array.isArray(p.images) && p.images.length > 0);
    if (storageGb !== undefined) {
      products = products.filter((p) =>
        hasStorageGb(storageGb, { storage: p.storage, storageOptions: p.storageOptions }),
      );
    }
    if (ramGb !== undefined) {
      const ramStr = String(ramGb);
      products = products.filter((p) => p.ram?.startsWith(ramStr) ?? false);
    }

    if (normalizedSearch) {
      const candidates = products.slice(0, 300);
      const normalizedQueryNoSpaces = normalizedSearch.replace(/\s+/g, "");
      products = candidates.filter((p) => {
        const st = (p.searchNormalized ?? p.phoneType ?? "").toLowerCase().replace(/\s+/g, "");
        return st.includes(normalizedQueryNoSpaces);
      });
    }

    return Promise.all(
      products.map(async (p) => {
        try {
          const normalizedStorage = normalizeProductStorage({
            storage: p.storage,
            storageOptions: p.storageOptions,
          });
          return {
            ...p,
            storage: normalizedStorage.storage,
            storageOptions: normalizedStorage.storageOptions,
            images: await normalizeImageUrls(ctx, p.images),
          };
        } catch {
          const normalizedStorage = normalizeProductStorage({
            storage: p.storage,
            storageOptions: p.storageOptions,
          });
          return {
            ...p,
            storage: normalizedStorage.storage,
            storageOptions: normalizedStorage.storageOptions,
            images: [],
          };
        }
      }),
    );
  },
});

export const getProductById = query({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    const p = await ctx.db.get(productId);
    if (!p) return null;
    const normalizedStorage = normalizeProductStorage({
      storage: p.storage,
      storageOptions: p.storageOptions,
    });
    return {
      ...p,
      storage: normalizedStorage.storage,
      storageOptions: normalizedStorage.storageOptions,
      images: await normalizeImageUrls(ctx, p.images),
    };
  },
});

export const createProduct = mutation({
  args: {
    type: vProductType,
    phoneType: v.string(),
    ram: v.optional(v.string()),
    storage: v.optional(v.string()),
    storageOptions: v.optional(v.array(vStorageOption)),
    condition: v.optional(vCondition),
    price: v.number(),
    stockQuantity: v.number(),
    exchangeEnabled: v.boolean(),
    description: v.optional(v.string()),
    images: v.array(vImageInput),
    createdBy: v.string(),
    updatedBy: v.string(),
    sellerId: v.string(),
    screenSize: v.optional(v.string()),
    battery: v.optional(v.string()),
    mainCamera: v.optional(v.string()),
    selfieCamera: v.optional(v.string()),
    simType: v.optional(v.string()),
    color: v.optional(v.string()),
    operatingSystem: v.optional(v.string()),
    features: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const exchangeEnabled = normalizeExchangeEnabled(args.type, args.exchangeEnabled);
    const images = sanitizeImageUrls(args.images);
    const normalizedStorage = normalizeProductStorage({
      storage: args.storage,
      storageOptions: args.storageOptions,
    });
    return await ctx.db.insert("products", {
      ...args,
      storage: normalizedStorage.storage,
      storageOptions: normalizedStorage.storageOptions,
      images,
      exchangeEnabled,
      isArchived: false,
      searchText: buildSearchText({
        ...args,
        storage: normalizedStorage.searchText,
      }),
      searchNormalized: buildSearchNormalized({
        ...args,
        storage: normalizedStorage.searchText,
      }),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    type: v.optional(vProductType),
    phoneType: v.optional(v.string()),
    ram: v.optional(v.string()),
    storage: v.optional(v.string()),
    storageOptions: v.optional(v.array(vStorageOption)),
    condition: v.optional(vCondition),
    price: v.optional(v.number()),
    stockQuantity: v.optional(v.number()),
    exchangeEnabled: v.optional(v.boolean()),
    description: v.optional(v.string()),
    images: v.optional(v.array(vImageInput)),
    updatedBy: v.string(),
    screenSize: v.optional(v.string()),
    battery: v.optional(v.string()),
    mainCamera: v.optional(v.string()),
    selfieCamera: v.optional(v.string()),
    simType: v.optional(v.string()),
    color: v.optional(v.string()),
    operatingSystem: v.optional(v.string()),
    features: v.optional(v.string()),
  },
  handler: async (ctx, { productId, updatedBy, images, ...patch }) => {
    const existing = await ctx.db.get(productId);
    if (!existing) {
      throw new Error("Product not found");
    }

    const effectiveType: ProductType = patch.type ?? existing.type;
    const effectiveExchangeEnabled = patch.exchangeEnabled ?? existing.exchangeEnabled;
    const normalizedExchangeEnabled = normalizeExchangeEnabled(
      effectiveType,
      effectiveExchangeEnabled,
    );
    const normalizedStorage = normalizeProductStorage({
      storage: patch.storage ?? existing.storage,
      storageOptions: patch.storageOptions ?? existing.storageOptions,
    });

    const searchFieldArgs = {
      phoneType: patch.phoneType ?? existing.phoneType,
      storage: normalizedStorage.searchText,
      ram: patch.ram ?? existing.ram,
      condition: patch.condition ?? existing.condition,
    };
    const searchText = buildSearchText(searchFieldArgs);
    const searchNormalized = buildSearchNormalized(searchFieldArgs);
    const imagePatch =
      images !== undefined ? { images: sanitizeImageUrls(images) } : {};

    await ctx.db.patch(productId, {
      ...patch,
      storage: normalizedStorage.storage,
      storageOptions: normalizedStorage.storageOptions,
      ...imagePatch,
      exchangeEnabled: normalizedExchangeEnabled,
      searchText,
      searchNormalized,
      updatedAt: Date.now(),
      updatedBy,
    });
  },
});

export const updateStockQuantity = mutation({
  args: {
    productId: v.id("products"),
    delta: v.number(),
  },
  handler: async (ctx, { productId, delta }) => {
    if (delta !== 1 && delta !== -1) {
      throw new Error("delta must be exactly 1 or -1");
    }

    const product = await ctx.db.get(productId);
    if (!product) {
      throw new Error("Product not found");
    }

    const newQty = Math.max(0, product.stockQuantity + delta);
    await ctx.db.patch(productId, {
      stockQuantity: newQty,
    });

    return { stockQuantity: newQty };
  },
});

export const archiveProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    const now = Date.now();
    await ctx.db.patch(productId, {
      isArchived: true,
      archivedAt: now,
      updatedAt: now,
    });
  },
});

export const restoreProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    const now = Date.now();
    await ctx.db.patch(productId, {
      isArchived: false,
      archivedAt: undefined,
      updatedAt: now,
    });
  },
});

export const permanentDeleteProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    await ctx.db.delete(productId);
  },
});

export const backfillSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let updated = 0;
    for (const product of products) {
      const normalizedStorage = normalizeProductStorage({
        storage: product.storage,
        storageOptions: product.storageOptions,
      });
      const searchText = buildSearchText({
        phoneType: product.phoneType,
        storage: normalizedStorage.searchText,
        ram: product.ram ?? undefined,
        condition: product.condition ?? undefined,
      });
      await ctx.db.patch(product._id, { searchText });
      updated += 1;
    }
    return { updated };
  },
});

export const backfillSearchNormalized = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let updated = 0;
    for (const product of products) {
      const normalizedStorage = normalizeProductStorage({
        storage: product.storage,
        storageOptions: product.storageOptions,
      });
      const searchNormalized = buildSearchNormalized({
        phoneType: product.phoneType,
        storage: normalizedStorage.searchText,
        ram: product.ram ?? undefined,
        condition: product.condition ?? undefined,
      });
      await ctx.db.patch(product._id, { searchNormalized });
      updated += 1;
    }
    return { updated };
  },
});

export const migratePhoneType = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let updated = 0;
    for (const product of products) {
      if (typeof product.phoneType === "string" && product.phoneType.trim()) {
        continue;
      }
      const fallback = [product.brand, product.model].filter(Boolean).join(" ").trim();
      if (!fallback) continue;
      await ctx.db.patch(product._id, {
        phoneType: fallback,
      });
      updated += 1;
    }
    return { updated };
  },
});

export const backfillStorageOptions = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let updated = 0;
    for (const product of products) {
      if (Array.isArray(product.storageOptions) && product.storageOptions.length > 0) {
        continue;
      }
      const normalized = normalizeProductStorage({
        storage: product.storage,
        storageOptions: product.storageOptions,
      });
      await ctx.db.patch(product._id, {
        storage: normalized.storage,
        storageOptions: normalized.storageOptions,
      });
      updated += 1;
    }
    return { updated };
  },
});

export const backfillIsArchived = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let updated = 0;
    for (const product of products) {
      if (typeof product.isArchived === "boolean") {
        continue;
      }
      await ctx.db.patch(product._id, {
        isArchived: false,
      });
      updated += 1;
    }
    return { updated };
  },
});

export const cleanupLegacyBrandModel = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    let updated = 0;
    for (const product of products) {
      const patch: Record<string, unknown> = {};
      if (product.brand !== undefined) {
        patch.brand = undefined;
      }
      if (product.model !== undefined) {
        patch.model = undefined;
      }
      if (Object.keys(patch).length === 0) continue;
      await ctx.db.patch(product._id, patch);
      updated += 1;
    }
    return { updated };
  },
});

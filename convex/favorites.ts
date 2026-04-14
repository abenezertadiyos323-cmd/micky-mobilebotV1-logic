import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all favorites for a user
export const getFavorites = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.userId || !args.userId.trim()) return [];
    return await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId.trim()))
      .collect();
  },
});

// Add a product to favorites
export const addFavorite = mutation({
  args: {
    userId: v.string(),
    phoneId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId.trim();
    const phoneId = args.phoneId.trim();
    if (!userId || !phoneId) throw new Error("userId and phoneId are required");

    // Prevent duplicates
    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("phoneId"), phoneId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("favorites", {
      userId,
      phoneId,
      createdAt: Date.now(),
    });
  },
});

// Remove a product from favorites
export const removeFavorite = mutation({
  args: {
    userId: v.string(),
    phoneId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId.trim();
    const phoneId = args.phoneId.trim();
    if (!userId || !phoneId) throw new Error("userId and phoneId are required");

    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("phoneId"), phoneId))
      .first();

    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});

// Check if a specific product is favorited by a user
export const isFavorite = query({
  args: {
    userId: v.string(),
    phoneId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.userId || !args.phoneId) return false;
    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId.trim()))
      .filter((q) => q.eq(q.field("phoneId"), args.phoneId.trim()))
      .first();
    return existing !== null;
  },
});

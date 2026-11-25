import { z } from "zod";
import { amenities, categories, cities } from "@/types/workspace";
import type { Amenity, Category } from "@/types/workspace";

const optionalPrice = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number<string>().int().min(0).max(100_000).optional(),
);

export const workspaceQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  city: z.union([z.enum(cities), z.literal("")]).default(""),
  category: z.union([z.enum(Object.keys(categories) as Category[]), z.literal("")]).default(""),
  min: optionalPrice,
  max: optionalPrice,
  amenity: z.array(z.enum(Object.keys(amenities) as Amenity[])).max(6).default([]),
  available: z.enum(["", "1"]).default(""),
  sort: z.enum(["featured", "price-asc", "price-desc", "rating"]).default("featured"),
  page: z.coerce.number<string | number>().int().min(1).max(10_000).default(1),
}).refine(({ min, max }) => min === undefined || max === undefined || min <= max, {
  message: "Maximum price must be at least the minimum price.",
  path: ["max"],
});

export type WorkspaceQuery = z.output<typeof workspaceQuerySchema>;
export type SearchParams = Record<string, string | string[] | undefined>;

export function parseWorkspaceQuery(params: SearchParams) {
  const { amenity, ...values } = params;
  return workspaceQuerySchema.safeParse({
    ...values,
    amenity: typeof amenity === "string" ? [amenity] : amenity,
  });
}

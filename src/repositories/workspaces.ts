import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { withCatalogCache } from "@/lib/catalog-cache";
import { db } from "@/lib/database";
import { reservationTransaction } from "@/services/reservation-transaction";
import { cities, type City, type Workspace } from "@/types/workspace";
import type { WorkspaceQuery } from "@/validations/workspace-query";

const PAGE_SIZE = 6;
const orderBy: Record<WorkspaceQuery["sort"], Prisma.WorkspaceOrderByWithRelationInput> = {
  featured: { featured: "desc" },
  "price-asc": { hourlyPricePaise: "asc" },
  "price-desc": { hourlyPricePaise: "desc" },
  rating: { ratingTenths: "desc" },
};

const catalogFields = {
  slug: true,
  name: true,
  city: true,
  neighborhood: true,
  address: true,
  timezone: true,
  kind: true,
  description: true,
  opensMinute: true,
  closesMinute: true,
  hourlyPricePaise: true,
  ratingTenths: true,
  sampleAvailableSeats: true,
  amenities: true,
  imageSrc: true,
  imageAlt: true,
  featured: true,
} satisfies Prisma.WorkspaceSelect;

function displayTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const time = String(minutes % 60).padStart(2, "0");
  return `${hours % 12 || 12}:${time} ${hours % 24 < 12 ? "AM" : "PM"}`;
}

function toWorkspace(row: Prisma.WorkspaceGetPayload<{ select: typeof catalogFields }>): Workspace {
  return {
    id: row.slug,
    name: row.name,
    city: row.city,
    neighborhood: row.neighborhood,
    address: row.address,
    timezone: row.timezone,
    category: row.kind,
    description: row.description,
    hours: `${displayTime(row.opensMinute)} – ${displayTime(row.closesMinute)}`,
    hourlyPrice: row.hourlyPricePaise / 100,
    rating: row.ratingTenths / 10,
    sampleAvailableSeats: row.sampleAvailableSeats,
    amenities: row.amenities,
    image: { src: row.imageSrc, alt: row.imageAlt },
    featured: row.featured,
  };
}

export function listWorkspaces(query: WorkspaceQuery) {
  const cacheKey = JSON.stringify({ ...query, amenity: [...query.amenity].sort() });
  return withCatalogCache(`workspaces:${cacheKey}`, 30, () => queryWorkspaces(query));
}

async function queryWorkspaces(query: WorkspaceQuery) {
  const search = { contains: query.q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } as const;
  const where: Prisma.WorkspaceWhereInput = {
    published: true,
    ...(query.q && {
      OR: [
        { name: search },
        { neighborhood: search },
        ...cities.filter((city) => city.toLowerCase().includes(query.q.toLowerCase())).map((city) => ({ city })),
      ],
    }),
    ...(query.city && { city: query.city }),
    ...(query.category && { kind: query.category }),
    ...(query.min !== undefined || query.max !== undefined ? {
      hourlyPricePaise: {
        ...(query.min !== undefined && { gte: query.min * 100 }),
        ...(query.max !== undefined && { lte: query.max * 100 }),
      },
    } : {}),
    ...(query.amenity.length > 0 && { amenities: { hasEvery: query.amenity } }),
    ...(query.available && { sampleAvailableSeats: { gt: 0 } }),
  };

  return reservationTransaction(async (transaction) => {
    const total = await transaction.workspace.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(query.page, totalPages);
    const rows = await transaction.workspace.findMany({
      where,
      select: catalogFields,
      orderBy: [orderBy[query.sort], { slug: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { workspaces: rows.map(toWorkspace), total, page, totalPages };
  }, "RepeatableRead");
}

export function getWorkspace(id: string) {
  return withCatalogCache(`workspace:${id}`, 90, async () => {
    const row = await db().workspace.findUnique({ where: { slug: id, published: true }, select: catalogFields });
    return row ? toWorkspace(row) : null;
  });
}

export function getHomeCatalog() {
  return withCatalogCache("home", 30, queryHomeCatalog);
}

async function queryHomeCatalog() {
  const workspace = db().workspace;
  const [featured, study, counts] = await Promise.all([
    workspace.findMany({
      where: { published: true, featured: true },
      orderBy: [{ ratingTenths: "desc" }, { slug: "asc" }],
      take: 3,
      select: catalogFields,
    }),
    workspace.findMany({
      where: { published: true, OR: [{ kind: "study" }, { kind: "library", featured: true }] },
      orderBy: [{ featured: "desc" }, { ratingTenths: "desc" }, { slug: "asc" }],
      take: 3,
      select: catalogFields,
    }),
    workspace.groupBy({ by: ["city"], where: { published: true }, _count: { _all: true } }),
  ]);
  const cityCounts: Record<City, number> = { Mangaluru: 0, Bengaluru: 0, Hubballi: 0 };
  for (const { city, _count } of counts) cityCounts[city] = _count._all;

  return { featured: featured.map(toWorkspace), study: study.map(toWorkspace), cityCounts };
}

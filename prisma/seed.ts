import { createDatabaseClient } from "@/lib/database";
import { invalidateCatalogCache } from "@/lib/catalog-cache";
import { disconnectRedis } from "@/lib/redis";
import { workspaceFixtures } from "./workspace-fixtures";

const categories = [
  { name: "Standard desks", prefix: "S", rows: 2, columns: 6, markupPaise: 0 },
  { name: "Premium desks", prefix: "P", rows: 1, columns: 6, markupPaise: 1_500 },
  { name: "Window seats", prefix: "W", rows: 1, columns: 4, markupPaise: 1_000 },
  { name: "Private study cabins", prefix: "C", rows: 1, columns: 2, markupPaise: 2_500 },
  { name: "Group tables", prefix: "G", rows: 1, columns: 4, markupPaise: 500 },
] as const;

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const istOffsetMs = 330 * minuteMs;
const dayStart = Math.floor((Date.now() + istOffsetMs) / dayMs) * dayMs - istOffsetMs;

function slotsForWeek(opensMinute: number, closesMinute: number) {
  const slots: { startsAt: Date; endsAt: Date }[] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let minute = opensMinute; minute < closesMinute; minute += 30) {
      const start = dayStart + day * dayMs + minute * minuteMs;
      slots.push({ startsAt: new Date(start), endsAt: new Date(start + 30 * minuteMs) });
    }
  }
  return slots;
}

const client = createDatabaseClient();

async function seed() {
  for (const fixture of workspaceFixtures) {
    const { id: slug, category: kind, hourlyPrice, rating, image, ...fields } = fixture;

    await client.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.upsert({
        where: { slug },
        update: {},
        create: {
          ...fields,
          slug,
          kind,
          hourlyPricePaise: hourlyPrice * 100,
          ratingTenths: Math.round(rating * 10),
          imageSrc: image.src,
          imageAlt: image.alt,
        },
      });
      const workspaceId = workspace.id;

      for (const [displayOrder, section] of categories.entries()) {
        const { name, prefix, rows, columns, markupPaise } = section;
        const category = await transaction.seatCategory.upsert({
          where: { workspaceId_name: { workspaceId, name } },
          update: {},
          create: {
            workspaceId,
            name,
            displayOrder,
            slotPricePaise: Math.round(workspace.hourlyPricePaise / 2) + markupPaise,
          },
        });
        await transaction.seat.createMany({
          skipDuplicates: true,
          data: Array.from({ length: rows * columns }, (_, index) => ({
            workspaceId,
            categoryId: category.id,
            code: `${prefix}${index + 1}`,
            gridRow: Math.floor(index / columns) + 1,
            gridColumn: index % columns + 1,
          })),
        });
      }

      const slots = slotsForWeek(workspace.opensMinute, workspace.closesMinute);
      await transaction.timeSlot.createMany({
        data: slots.map((slot) => ({ workspaceId, ...slot })),
        skipDuplicates: true,
      });

      const [seats, timeSlots] = await Promise.all([
        transaction.seat.findMany({ where: { workspaceId, active: true }, select: { id: true } }),
        transaction.timeSlot.findMany({
          where: { workspaceId, active: true, startsAt: { in: slots.map(({ startsAt }) => startsAt) } },
          select: { id: true },
        }),
      ]);
      await transaction.seatSlot.createMany({
        data: timeSlots.flatMap((slot) => seats.map((seat) => ({ workspaceId, timeSlotId: slot.id, seatId: seat.id }))),
        skipDuplicates: true,
      });
    }, { timeout: 30_000 });
  }

  console.log(`Seeded ${workspaceFixtures.length} demo workspaces and seven days of half-hour inventory.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Could not seed the SeatSync database.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await invalidateCatalogCache();
    disconnectRedis("cache");
    await client.$disconnect();
  });

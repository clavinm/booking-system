# Phase 1 guided walkthrough

This is a record of Phase 1. The current application uses PostgreSQL and working accounts. See the [Phase 2 walkthrough](phase-2.md) for the current data and authentication path.

Phase 1 establishes the app shell and the complete read-only discovery flow. Start with the files below in order. Each step follows the same search through a different layer of the application.

## 1. Start with the route and layout

Open [layout.tsx](../src/app/layout.tsx) and [page.tsx](../src/app/page.tsx). Next.js maps the homepage file to `/`. The layout renders the shared header, footer and page content. The homepage asks the catalog repository for featured workspaces, study recommendations and city counts.

The homepage is a **Server Component**. It can read the catalog on the server and send rendered content to the browser. The [hero headline](../src/components/workspaces/hero-heading.tsx) is a small **Client Component** because Motion animates it in the browser. The mobile filter panel also runs a Client Component so React can track whether the controls are open. Most of the catalog can use server rendering.

## 2. Submit a search

Open [search-form.tsx](../src/components/workspaces/search-form.tsx). Type `Kadri`, select Mangaluru and press **Search spaces**. The browser sends a GET navigation to a URL like this:

```text
/workspaces?q=Kadri&city=Mangaluru
```

Each input’s `name` becomes a query parameter. GET suits this action because a search only reads data. The URL preserves your choices when you reload or share it. The [discovery filter form](../src/components/workspaces/discovery-filters.tsx) uses the same route. Multiple amenity checkboxes submit multiple values with the name `amenity`.

## 3. Validate what arrives on the server

Open the [discovery page](../src/app/workspaces/page.tsx) and [workspace-query.ts](../src/validations/workspace-query.ts). In this Next.js version, the page receives `searchParams` as a promise. After awaiting it, the page calls `parseWorkspaceQuery`.

TypeScript checks variables at build time. A person can edit a URL after the build, so Zod checks real values when each request arrives. It accepts cities from the catalog, converts numeric query strings to numbers and checks that the minimum price does not exceed the maximum. After successful validation, TypeScript knows the exact shape that the repository can read.

Try changing the URL to `/workspaces?min=150&max=60`. The page explains the price error. The matching API call returns HTTP 400 with a structured error body.

## 4. Filter, sort and paginate

Open [workspaces.ts](../src/repositories/workspaces.ts). The repository is the set of functions that knows where to get catalog data. Follow `listWorkspaces`:

1. Read the eight entries in [the sample entries](../prisma/workspace-fixtures.ts).
2. Filter by name, neighborhood or city and check the remaining filters. `every` means a workspace must have all checked amenities.
3. Sort on the requested field. The ID breaks ties so results land on the same page for the same query.
4. Compute the total and take up to six results for the requested page.

The query and the data source are separate. In Phase 2 the matching and pagination will run in PostgreSQL. Returning the same shape lets the UI keep using the repository.

## 5. Render and open a workspace

The [WorkspaceCard](../src/components/workspaces/workspace-card.tsx) receives one typed object. The same component renders cards on the homepage and on the discovery page. It uses Next.js Image to generate appropriately sized image responses. Clicking the workspace name or **Book now** currently opens the [details preview](../src/app/workspaces/[id]/page.tsx).

The folder name `[id]` captures part of the URL. For `/workspaces/the-reading-room`, the page awaits `params` and queries that ID. It calls Next.js `notFound()` if the ID is missing from the catalog. Phase 3 will add live slot and seat selection. The account links lead to a Phase 2 status page.

## 6. Compare the page and the API

Open the [catalog Route Handler](../src/app/api/workspaces/route.ts). Visit `/api/workspaces?city=Mangaluru` in the browser. It returns JSON and an HTTP status. The page and handler each call the same validator and repository. Server-rendered pages can call those functions directly. A client calling over HTTP can use the API.

Open [workspaces.test.ts](../tests/workspaces.test.ts) and read the first test. It builds a request with multiple filters, calls that same Route Handler, checks the status and verifies the exact workspace returned. This is a small test that exercises validation and catalog lookup together. Later tests will send overlapping requests and check what PostgreSQL committed.

## Files created or changed

| Files | Role |
| --- | --- |
| `src/app/` | Homepage, catalog, details, account status, API routes, loading and error states, branding and global CSS. The starter routes moved from the root `app/` directory. |
| `src/components/` | Shared navigation, search and filters, workspace cards, Button and Skeleton primitives. |
| `src/types/workspace.ts`, `src/validations/workspace-query.ts` | The shared workspace shape and runtime validation rules. |
| `src/repositories/` | Fictional catalog data and server-only queries. |
| `public/workspaces/` | Four local WebP interiors. The built-in image generator created a four-panel editorial contact sheet of a sunlit coworking loft, a library, an oak coworking studio and a green-chair reading room, with no text or logos. Each panel was cropped for use in the catalog. |
| `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.mts` | Dependencies, scripts, source aliases, supported Tailwind integration and test setup. |
| `tests/workspaces.test.ts`, `.env.example`, `.gitignore`, `README.md`, `docs/` | Tests, environment template, project entry point and learning guides. |

## Acceptance checks

- Browse eight fictional spaces across the three cities and navigate between the homepage, discovery and details.
- Apply city, category, price, amenity and sample availability together. Verify both price sorts, rating sorting and pagination.
- Reopen a search URL and see the same filters and results. Use keyboard focus to reach the search, controls and cards. On mobile, open and close the filter panel.
- See an empty state for a valid search with no matches and a helpful message for malformed filters. Check the missing-page view for an unknown workspace and verify that the details API returns HTTP 404.
- Run `npm test`, `npm run lint`, `npm run typecheck` and a production build. Review the test output before attributing any results to the reservation engine.

## Try it yourself

1. Predict which spaces match `/workspaces?city=Mangaluru&amenity=quiet&max=80`, then compare the page and API results.
2. Explain where you would change the page size. Then write down what would break if you paginated before sorting.
3. Imagine two people open the same page and both see one seat. Explain what the page can tell them and which piece of the planned reservation flow must decide who gets it.

## Workspace image prompt

The built-in image generator supplied the contact sheet used to produce the WebP files in [public/workspaces](../public/workspaces).

> Use case: photorealistic-natural. Asset: one photographic contact sheet for a workspace discovery website. EXACT edge-to-edge 2 by 2 grid, no gutters, no borders, no typography. Each quadrant a standalone landscape frame. Top left: bright premium modern Bangalore coworking loft, glass walls, long shared wooden tables, muted ink and navy chairs, lots of tall windows, leafy greenery, wide architectural view. Top right: sunlit quiet Mangaluru study library, wood desks and tall bookshelves, warm cream walls, focused natural editorial shot. Bottom left: Hubballi modern cowork studio with honey oak desks and rust-toned chairs, tropical plants, broad windows. Bottom right: calm upscale reading room with forest-green chairs and individual wood study carrels, refined daylight. Photorealistic architectural photography, natural believable material texture, interiors mostly empty, no people or only distant blurred silhouettes, no lettering or logos. Compose each photo entirely within its quadrant so they can be cropped independently.

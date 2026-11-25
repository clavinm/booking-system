import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { amenities, categories, cities, type Amenity } from "@/types/workspace";
import type { WorkspaceQuery } from "@/validations/workspace-query";

export function DiscoveryFilters({ query }: { query?: WorkspaceQuery }) {
  return (
    <Form action="/workspaces" className="filters-panel" aria-label="Filter workspaces">
      <div className="filters-heading"><h2>Filters</h2><Link href="/workspaces">Reset</Link></div>
      <label className="field-label">Search spaces
        <span className="filter-search"><Search size={17} aria-hidden="true" /><input type="search" name="q" placeholder="Name or area" defaultValue={query?.q} maxLength={100} /></span>
      </label>
      <label className="field-label">City
        <select name="city" defaultValue={query?.city ?? ""}>
          <option value="">All cities</option>
          {cities.map((city) => <option key={city}>{city}</option>)}
        </select>
      </label>
      <label className="field-label">Workspace type
        <select name="category" defaultValue={query?.category ?? ""}>
          <option value="">All types</option>
          {Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>Hourly price (₹)</legend>
        <div className="price-range">
          <label><span className="sr-only">Minimum hourly price</span><input type="number" name="min" min={0} max={100000} placeholder="Min" defaultValue={query?.min} /></label>
          <label><span className="sr-only">Maximum hourly price</span><input type="number" name="max" min={0} max={100000} placeholder="Max" defaultValue={query?.max} /></label>
        </div>
      </fieldset>
      <fieldset className="check-group">
        <legend>Amenities</legend>
        {Object.entries(amenities).map(([id, label]) => (
          <label key={id}><input type="checkbox" name="amenity" value={id} defaultChecked={query?.amenity.includes(id as Amenity)} /> {label}</label>
        ))}
      </fieldset>
      <label className="checkbox-row"><input type="checkbox" name="available" value="1" defaultChecked={query?.available === "1"} /> With demo seats available</label>
      <label className="field-label">Sort by
        <select name="sort" defaultValue={query?.sort ?? "featured"}>
          <option value="featured">Featured first</option>
          <option value="price-asc">Lowest price</option>
          <option value="price-desc">Highest price</option>
          <option value="rating">Top rated</option>
        </select>
      </label>
      <Button type="submit">Apply filters</Button>
    </Form>
  );
}

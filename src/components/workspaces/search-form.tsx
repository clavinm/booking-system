import Form from "next/form";
import { ArrowRight, ChevronDown, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cities } from "@/types/workspace";

export function SearchForm() {
  return (
    <Form action="/workspaces" className="hero-search" aria-label="Find a workspace">
      <label className="search-field">
        <Search size={21} aria-hidden="true" />
        <span className="sr-only">Workspace name or area</span>
        <input name="q" type="search" placeholder="Workspace name or area" maxLength={100} />
      </label>
      <label className="search-field search-location">
        <MapPin size={20} aria-hidden="true" />
        <span className="sr-only">City</span>
        <select name="city" defaultValue="">
          <option value="">All cities</option>
          {cities.map((city) => <option key={city}>{city}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </label>
      <Button type="submit" data-hero-action>Search spaces <ArrowRight size={18} aria-hidden="true" /></Button>
    </Form>
  );
}

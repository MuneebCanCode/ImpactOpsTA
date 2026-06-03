import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OrganizationFilters } from "@/features/organizations/hooks";
import { ORG_TYPE_OPTIONS, type OrgType } from "@/features/organizations/schemas";

/**
 * Directory search + Organization_Type filter (Requirement 18).
 *
 * This is a controlled, presentational component: it renders the two filter
 * controls and reports every change up to its parent (the DirectoryPage), which
 * owns the {@link OrganizationFilters} state and feeds it to `useOrganizations`.
 * Because those filters participate in the React Query key, each search/type
 * combination is cached independently and an empty filtered result naturally
 * flows into the State_Pattern's empty branch (Requirement 18.3 — the empty
 * rendering itself lives in the DirectoryPage / `QueryState`, not here).
 *
 * - **Search** (Requirement 18.1): a free-text input whose value becomes the
 *   `search` filter. The actual matching is a case-insensitive name substring
 *   match applied server-side by `useOrganizations` (PostgREST `ilike '%…%'`);
 *   this component only captures the term. An empty input is normalized to
 *   `undefined` so "no search" yields a clean filter object (and stable key).
 * - **Type** (Requirement 18.2): a select listing every Organization_Type plus
 *   an "All types" option. Choosing a type sets the exact-match `type` filter;
 *   choosing "All types" clears it (`undefined`), showing organizations of
 *   every type.
 *
 * The component is fully controlled — it derives the rendered values from the
 * `value` prop and never holds its own copy — so the parent's state is always
 * the single source of truth.
 */

type DirectoryFiltersProps = {
  /** The current directory filters owned by the parent. */
  value: OrganizationFilters;
  /** Called with the next filters whenever the search term or type changes. */
  onChange: (filters: OrganizationFilters) => void;
  /** Optional extra classes merged onto the filter bar container. */
  className?: string;
};

/** Sentinel `<option>` value representing "no type filter" (all types). */
const ALL_TYPES_VALUE = "";

export function DirectoryFilters({
  value,
  onChange,
  className,
}: DirectoryFiltersProps) {
  const handleSearchChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const nextSearch = event.target.value;
    // Normalize an empty input to `undefined` so an unused search filter does
    // not churn the query key (search: "" vs. absent).
    onChange({
      ...value,
      search: nextSearch === "" ? undefined : nextSearch,
    });
  };

  const handleTypeChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const nextType = event.target.value;
    onChange({
      ...value,
      type: nextType === ALL_TYPES_VALUE ? undefined : (nextType as OrgType),
    });
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label htmlFor="directory-search" className="sr-only">
          Search organizations by name
        </label>
        <input
          id="directory-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Search by name…"
          value={value.search ?? ""}
          onChange={handleSearchChange}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors sm:h-9",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </div>

      <div className="sm:w-48">
        <label htmlFor="directory-type-filter" className="sr-only">
          Filter by organization type
        </label>
        <select
          id="directory-type-filter"
          value={value.type ?? ALL_TYPES_VALUE}
          onChange={handleTypeChange}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors sm:h-9",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <option value={ALL_TYPES_VALUE}>All types</option>
          {ORG_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default DirectoryFilters;

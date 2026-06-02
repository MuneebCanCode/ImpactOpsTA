import { Briefcase, GraduationCap, HeartHandshake, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ORG_TYPE_LABELS, type OrgType } from "./schemas";

/**
 * A small presentational badge that visually distinguishes an Organization by
 * its Organization_Type (Requirement 6.5).
 *
 * Each type maps to its own color treatment AND its own icon, so the three
 * types are distinguishable both by color and by shape (the icon keeps the
 * badges legible for color-blind users and in case two palettes read similarly
 * at small sizes). The badge renders the human-readable label sourced from the
 * schema's {@link ORG_TYPE_LABELS}, keeping a single source of truth for the
 * type label set.
 *
 * The component is purely presentational: it takes a `type` and renders. It is
 * used in the Directory rows and the Org_Detail_View header.
 */

type OrgTypeBadgeProps = {
  /** The Organization_Type to render a badge for. */
  type: OrgType;
  /** Optional extra classes merged onto the badge container. */
  className?: string;
};

/**
 * Per-type visual treatment. Each entry pairs a distinct, theme-aware color
 * palette (with explicit `dark:` variants so it stays legible in dark mode)
 * with a distinct icon. Tailwind's static color utilities are used here rather
 * than the design-system CSS variables because the goal is for the three types
 * to be visually DIFFERENT from one another, not to match a single accent.
 */
const TYPE_STYLES: Record<OrgType, { icon: LucideIcon; className: string }> = {
  school: {
    icon: GraduationCap,
    className:
      "bg-blue-100 text-blue-800 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-400/30",
  },
  nonprofit: {
    icon: HeartHandshake,
    className:
      "bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30",
  },
  business: {
    icon: Briefcase,
    className:
      "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30",
  },
};

export function OrgTypeBadge({ type, className }: OrgTypeBadgeProps) {
  const { icon: Icon, className: typeClassName } = TYPE_STYLES[type];
  const label = ORG_TYPE_LABELS[type];

  return (
    <span
      data-org-type={type}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        typeClassName,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

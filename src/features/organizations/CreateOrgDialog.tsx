import { useEffect, useState, type ReactNode } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Plus, X } from "lucide-react";

import { AuthErrorBanner, AuthField } from "@/features/auth/AuthFormLayout";
import { useCreateOrganization } from "@/features/organizations/hooks";
import {
  createOrganizationSchema,
  ORG_TYPE_OPTIONS,
  type CreateOrganizationInput,
  type OrgType,
} from "@/features/organizations/schemas";
import type { Organization } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * Create-organization dialog (Requirements 5.2, 5.4, 6.1, 6.2, 6.3).
 *
 * A self-contained, accessible modal (built on Radix Dialog so focus-trapping,
 * Esc-to-close, scroll locking, and the `role="dialog"` / labelled title come
 * for free) containing the organization-creation form. The form is wired to the
 * canonical {@link createOrganizationSchema} via React Hook Form's Zod resolver,
 * so submission is blocked and field-level errors are shown whenever the input
 * is invalid (Requirements 5.2, 5.4). The defining behavior is type-driven: the
 * School District input is rendered if and only if the selected type is School
 * (Requirements 6.1, 6.2), and on the School branch the schema requires it to be
 * non-empty (Requirement 6.3).
 *
 * On a successful create, {@link useCreateOrganization} invalidates the
 * `['organizations']` cache (Requirement 5.5) and the dialog closes and resets.
 *
 * ## Form typing
 * `createOrganizationSchema` is a discriminated union on `type`, so its inferred
 * type has no common `school_district` key — accessing `register("school_district")`
 * or `errors.school_district` directly off the union is not type-safe. To keep
 * the form ergonomics clean we model the *form state* as a flat shape
 * ({@link CreateOrgFormValues}) and bridge the resolver with a cast; the schema
 * is still the single source of validation truth. The validated values are then
 * narrowed back into the precise {@link CreateOrganizationInput} union before
 * being handed to the mutation.
 */

/** Flat shape backing the form fields (the union schema validates it). */
type CreateOrgFormValues = {
  name: string;
  type: OrgType;
  school_district?: string;
};

const DEFAULT_VALUES: CreateOrgFormValues = {
  name: "",
  type: "school",
  school_district: "",
};

export type CreateOrgDialogProps = {
  /**
   * Controlled open state. When provided (together with `onOpenChange`), the
   * parent owns visibility; otherwise the dialog manages its own state and is
   * opened via {@link CreateOrgDialogProps.trigger}.
   */
  open?: boolean;
  /** Open-state change handler (required for controlled usage). */
  onOpenChange?: (open: boolean) => void;
  /**
   * Optional element rendered as the dialog trigger (wrapped with `asChild`).
   * When omitted in uncontrolled mode a default "Create organization" button is
   * rendered.
   */
  trigger?: ReactNode;
  /** Invoked with the newly created organization after a successful create. */
  onCreated?: (organization: Organization) => void;
};

export function CreateOrgDialog({
  open,
  onOpenChange,
  trigger,
  onCreated,
}: CreateOrgDialogProps) {
  // Support both controlled (parent passes `open`) and uncontrolled usage.
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = isControlled ? open : internalOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  const createOrganization = useCreateOrganization();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateOrgFormValues>({
    // The schema is a discriminated union; cast bridges its union input type to
    // the flat form shape. Validation itself is unchanged.
    resolver: zodResolver(createOrganizationSchema) as Resolver<CreateOrgFormValues>,
    mode: "onSubmit",
    defaultValues: DEFAULT_VALUES,
  });

  // Reset the form (and clear any stale mutation error) each time the dialog
  // opens, so reopening always starts from a clean slate.
  useEffect(() => {
    if (actualOpen) {
      reset(DEFAULT_VALUES);
      createOrganization.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualOpen]);

  // CRITICAL (Req 6.1, 6.2): the School District field is present iff the
  // currently selected type is School.
  const selectedType = watch("type");
  const isSchool = selectedType === "school";

  const isSubmitting = createOrganization.isPending;

  // Zod validation must pass before this runs, so an invalid form never reaches
  // the mutation (Req 5.4). Narrow the flat values into the precise union input.
  const onSubmit = handleSubmit((values) => {
    const input: CreateOrganizationInput =
      values.type === "school"
        ? {
            name: values.name,
            type: "school",
            school_district: values.school_district ?? "",
          }
        : { name: values.name, type: values.type };

    createOrganization.mutate(input, {
      onSuccess: (organization) => {
        onCreated?.(organization);
        reset(DEFAULT_VALUES);
        setOpen(false);
      },
    });
  });

  const mutationError = createOrganization.error
    ? createOrganization.error.message ||
      "Something went wrong creating the organization. Please try again."
    : null;

  return (
    <Dialog.Root open={actualOpen} onOpenChange={setOpen}>
      {trigger ? (
        <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      ) : !isControlled ? (
        <Dialog.Trigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-md",
              "bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors",
              "hover:bg-primary/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Create organization</span>
          </button>
        </Dialog.Trigger>
      ) : null}

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg",
            "focus:outline-none",
          )}
        >
          <div className="mb-4 space-y-1">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Create organization
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              Add a new organization to your directory.
            </Dialog.Description>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className={cn(
                "absolute right-4 top-4 rounded-sm p-1 text-muted-foreground transition-colors",
                "hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </Dialog.Close>

          <form noValidate onSubmit={onSubmit} className="space-y-4">
            <AuthErrorBanner message={mutationError} />

            <AuthField
              id="org-name"
              label="Organization name"
              placeholder="Acme High School"
              autoComplete="off"
              disabled={isSubmitting}
              error={errors.name?.message}
              {...register("name")}
            />

            <div className="space-y-1.5">
              <label htmlFor="org-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="org-type"
                disabled={isSubmitting}
                aria-invalid={errors.type ? true : undefined}
                aria-describedby={errors.type ? "org-type-error" : undefined}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  errors.type && "border-destructive focus-visible:ring-destructive",
                )}
                {...register("type")}
              >
                {ORG_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.type ? (
                <p
                  id="org-type-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.type.message}
                </p>
              ) : null}
            </div>

            {/*
              Req 6.1 / 6.2: render the School District input only while the
              selected type is School. For any other type the field is absent.
            */}
            {isSchool ? (
              <AuthField
                id="org-school-district"
                label="School district"
                placeholder="Springfield Unified School District"
                autoComplete="off"
                disabled={isSubmitting}
                error={errors.school_district?.message}
                {...register("school_district")}
              />
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isSubmitting}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  Cancel
                </button>
              </Dialog.Close>

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-2 rounded-md",
                  "bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors",
                  "hover:bg-primary/90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                <span>{isSubmitting ? "Creating…" : "Create organization"}</span>
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default CreateOrgDialog;

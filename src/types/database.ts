/**
 * Supabase database types.
 *
 * Hand-authored to match the migrated schema exactly (the Supabase CLI's
 * `gen types typescript` is not wired into this environment). It follows the
 * shape that `supabase gen types` produces so it is a drop-in generic for
 * `createClient<Database>(...)` and for the feature hooks' query/insert/update
 * typing.
 *
 * Source of truth:
 *   - supabase/migrations/0001_init_schema.sql  (tables + enums)
 *   - supabase/migrations/0002_rls_policies.sql (RLS — no type impact)
 *   - supabase/migrations/0003_profile_trigger.sql (handle_new_user)
 *
 * Column nullability and defaults are encoded the way supabase-js expects:
 *   - Row: the value always present when reading a row.
 *   - Insert: columns with a default or that are nullable are optional (`?`),
 *     nullable columns also accept `null`.
 *   - Update: every column is optional.
 *
 * Requirements: 10.1, 10.2
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          is_admin: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          is_admin?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          is_admin?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          type: Database["public"]["Enums"]["org_type"];
          school_district: string | null;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: Database["public"]["Enums"]["org_type"];
          school_district?: string | null;
          owner_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: Database["public"]["Enums"]["org_type"];
          school_district?: string | null;
          owner_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          email: string;
          status: Database["public"]["Enums"]["member_status"];
          role: Database["public"]["Enums"]["member_role"];
          invited_at: string;
          joined_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          email: string;
          status?: Database["public"]["Enums"]["member_status"];
          role?: Database["public"]["Enums"]["member_role"];
          invited_at?: string;
          joined_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          email?: string;
          status?: Database["public"]["Enums"]["member_status"];
          role?: Database["public"]["Enums"]["member_role"];
          invited_at?: string;
          joined_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      org_type: "school" | "nonprofit" | "business";
      member_status: "invited" | "active";
      member_role: "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

/* ------------------------------------------------------------------------- */
/* Generic helpers (mirror the supabase-generated helper utilities)          */
/* ------------------------------------------------------------------------- */

type PublicSchema = Database["public"];

export type Tables<
  TableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][TableName]["Row"];

export type TablesInsert<
  TableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][TableName]["Insert"];

export type TablesUpdate<
  TableName extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][TableName]["Update"];

export type Enums<
  EnumName extends keyof PublicSchema["Enums"],
> = PublicSchema["Enums"][EnumName];

/* ------------------------------------------------------------------------- */
/* Convenience aliases consumed by feature hooks                             */
/* ------------------------------------------------------------------------- */

// Row types
export type Profile = Tables<"profiles">;
export type Organization = Tables<"organizations">;
export type OrganizationMember = Tables<"organization_members">;

// Insert types
export type ProfileInsert = TablesInsert<"profiles">;
export type OrganizationInsert = TablesInsert<"organizations">;
export type OrganizationMemberInsert = TablesInsert<"organization_members">;

// Update types
export type ProfileUpdate = TablesUpdate<"profiles">;
export type OrganizationUpdate = TablesUpdate<"organizations">;
export type OrganizationMemberUpdate = TablesUpdate<"organization_members">;

// Enum unions
export type OrgType = Enums<"org_type">;
export type MemberStatus = Enums<"member_status">;
export type MemberRole = Enums<"member_role">;

/**
 * Literal value lists for the enums, useful for building selects, validating
 * filter params, and exhaustive iteration. Kept in lockstep with the
 * `public.Enums` definitions above.
 */
export const Constants = {
  public: {
    Enums: {
      org_type: ["school", "nonprofit", "business"],
      member_status: ["invited", "active"],
      member_role: ["admin", "member"],
    },
  },
} as const;

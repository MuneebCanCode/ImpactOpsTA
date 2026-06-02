import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { signUpSchema, type SignUpInput } from "@/features/auth/schemas";
import { useSignUp } from "@/features/auth/hooks";
import { mapSignUpError } from "@/features/auth/authErrors";
import {
  AuthErrorBanner,
  AuthField,
  AuthFormLayout,
} from "@/features/auth/AuthFormLayout";
import { cn } from "@/lib/utils";

/**
 * Admin sign-up screen (Requirement 1).
 *
 * Client-side validation runs through the shared {@link signUpSchema} via React
 * Hook Form's Zod resolver: invalid input produces field-level messages and
 * blocks submission (Requirements 1.2, 1.4). On submit the {@link useSignUp}
 * mutation creates the account and verifies the admin profile before
 * navigating; any failure (duplicate email, setup failure, or other Auth error)
 * is surfaced as a visible banner here rather than being swallowed
 * (Requirements 1.3, 1.6, 1.10). The submit control shows a spinner and is
 * disabled while the request is in flight.
 */
export function SignUpPage() {
  const signUp = useSignUp();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    mode: "onSubmit",
    defaultValues: { email: "", password: "" },
  });

  // Field-level Zod validation must pass before the mutation runs, so an
  // invalid form never reaches `signUp.mutate` (Requirement 1.4). Navigation on
  // success is handled inside the hook.
  const onSubmit = handleSubmit((values) => {
    signUp.mutate(values);
  });

  const formError = mapSignUpError(signUp.error);
  const isSubmitting = signUp.isPending;

  return (
    <AuthFormLayout
      title="Create your account"
      subtitle="Sign up to manage your organizations"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <AuthErrorBanner message={formError} />

        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          disabled={isSubmitting}
          error={errors.email?.message}
          {...register("email")}
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          disabled={isSubmitting}
          error={errors.password?.message}
          {...register("password")}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className={cn(
            "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md",
            "bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors",
            "hover:bg-primary/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          <span>{isSubmitting ? "Creating account…" : "Create account"}</span>
        </button>
      </form>
    </AuthFormLayout>
  );
}

export default SignUpPage;

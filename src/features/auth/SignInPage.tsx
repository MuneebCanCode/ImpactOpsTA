import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { signInSchema, type SignInInput } from "@/features/auth/schemas";
import { useSignIn } from "@/features/auth/hooks";
import { mapSignInError } from "@/features/auth/authErrors";
import {
  AuthErrorBanner,
  AuthField,
  AuthFormLayout,
} from "@/features/auth/AuthFormLayout";
import { cn } from "@/lib/utils";

/**
 * Admin sign-in screen (Requirement 2).
 *
 * The email format is validated through the shared {@link signInSchema} via the
 * Zod resolver before submission (Requirement 2.3); invalid input shows
 * field-level messages and blocks submit. On submit the {@link useSignIn}
 * mutation authenticates and navigates to the Directory on success; a wrong
 * email or password surfaces as a friendly banner (Requirement 2.2). While the
 * request is pending the submit control is disabled and shows a loading
 * indicator (Requirement 2.4).
 */
export function SignInPage() {
  const signIn = useSignIn();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: "onSubmit",
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    signIn.mutate(values);
  });

  const formError = mapSignInError(signIn.error);
  // Drives both the disabled submit control and the loading indicator while the
  // sign-in request is in progress (Requirement 2.4).
  const isSubmitting = signIn.isPending;

  return (
    <AuthFormLayout
      title="Welcome back"
      subtitle="Sign in to your dashboard"
      footer={
        <>
          Need an account?{" "}
          <Link
            to="/sign-up"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign up
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
          autoComplete="current-password"
          placeholder="Your password"
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
          <span>{isSubmitting ? "Signing in…" : "Sign in"}</span>
        </button>
      </form>
    </AuthFormLayout>
  );
}

export default SignInPage;

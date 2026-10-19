"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signup } from "@/lib/auth/signup";
import { PRODUCT_PITCH } from "@/lib/branding";
import { PASSWORD_HINT } from "@/lib/auth/password-schema";
import {
  Input,
  Alert,
  AlertDescription,
  LoadingButton,
  PasswordInput,
  Spinner,
  Field,
} from "@neoboard/components";
import { AuthCard } from "../auth-card";

/** The rule `newPasswordSchema` enforces (app/src/lib/auth/password-schema.ts). */

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  // Don't render any view until the status fetch settles. Otherwise the form
  // flashes with default state and then swaps once the fetch resolves — a UX
  // flash, and the race that made these tests flaky (they'd interact mid-swap).
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/bootstrap-status")
      .then((r) => r.json())
      .then((body) => {
        // Supports envelope format: { data: { bootstrapRequired }, ... }
        const payload = body?.data ?? body;
        setBootstrapRequired(payload?.bootstrapRequired === true);
        setRegistrationEnabled(payload?.registrationEnabled !== false);
      })
      .catch(() => {})
      .finally(() => setStatusChecked(true));
  }, []);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Enter the same password in both fields.");
      setLoading(false);
      return;
    }

    const result = await signup(formData);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Auto-login after signup
    const signInResult = await signIn("credentials", {
      email: formData.get("email"),
      password,
      redirect: false,
    });

    if (signInResult?.error) {
      router.push("/login");
    } else {
      router.push("/");
    }
  }

  // Hold the initial paint until we know the real registration status.
  if (!statusChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page-ground">
        <Spinner size="lg" />
      </div>
    );
  }

  const backToSignIn = (
    <Link href="/login" className="text-foreground underline">
      Back to sign in
    </Link>
  );

  if (!registrationEnabled && !bootstrapRequired) {
    return (
      <AuthCard
        title="Sign up"
        lead="Registration is disabled"
        footer={backToSignIn}
      >
        {/* Plain text, not a nested Alert box — the card is already the
            container, so a bordered box-in-box reads as card-in-card
            (#1038). */}
        <p className="text-center text-sm text-muted-foreground">
          Self-registration is disabled. Contact your administrator for an
          account.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign up"
      lead={bootstrapRequired ? "Set up the first admin" : PRODUCT_PITCH}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline">
            Sign in
          </Link>
        </>
      }
    >
      {bootstrapRequired && (
        <Alert>
          <AlertDescription>
            No users exist yet. You are setting up the first admin account.
            Enter the bootstrap token printed by <code>neoboard setup</code> —
            or read <code>ADMIN_BOOTSTRAP_TOKEN</code> from{" "}
            <code>docker/.env</code> (Docker) or <code>app/.env.local</code>{" "}
            (local).
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Field label="Name" id="name">
          <Input
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder="Your name"
          />
        </Field>

        <Field label="Email" id="email">
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Password" id="password" help={PASSWORD_HINT}>
          <PasswordInput
            name="password"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </Field>

        <Field label="Confirm password" id="confirmPassword">
          <PasswordInput
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </Field>

        {bootstrapRequired && (
          <Field label="Bootstrap token" id="bootstrapToken">
            <PasswordInput
              name="bootstrapToken"
              required
              placeholder="Enter ADMIN_BOOTSTRAP_TOKEN from .env"
            />
          </Field>
        )}

        <LoadingButton
          type="submit"
          loading={loading}
          loadingText={
            bootstrapRequired ? "Creating admin..." : "Creating account..."
          }
          className="w-full"
        >
          {bootstrapRequired ? "Create admin account" : "Create account"}
        </LoadingButton>
      </form>
    </AuthCard>
  );
}

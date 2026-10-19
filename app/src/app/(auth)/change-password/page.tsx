"use client";

import { useState } from "react";
import {
  Input,
  Label,
  Alert,
  AlertDescription,
  LoadingButton,
  PasswordInput,
} from "@neoboard/components";
import { signOut } from "next-auth/react";
import { AuthCard } from "../auth-card";

/** The rule `newPasswordSchema` enforces (app/src/lib/auth/password-schema.ts). */
const PASSWORD_HINT = "At least 8 characters, with a letter and a number.";

export default function ChangePasswordPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/users/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error?.message ?? "Failed to change password");
        setLoading(false);
        return;
      }

      // The change ends every session signed in before it, this one too
      // (#2160), so sign out and let the login page say why, as the profile
      // page does. A full reload: the client cache must not outlive the
      // session. @next/eslint-plugin-next 16.3 flags this shape generically.
      await signOut({ redirect: false });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login?passwordChanged=1";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Change password"
      lead="You must change your password before continuing."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>

        <LoadingButton
          type="submit"
          loading={loading}
          loadingText="Changing password..."
          className="w-full"
        >
          Change password
        </LoadingButton>
      </form>
    </AuthCard>
  );
}

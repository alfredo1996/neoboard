"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Input,
  Alert,
  AlertDescription,
  LoadingButton,
  PasswordInput,
  useToast,
  Field,
} from "@neoboard/components";
import { PageHeader, SettingsSection } from "@neoboard/components/kit";
import type { UserRole } from "@/lib/db/schema";
import { PASSWORD_HINT } from "@/lib/auth/password-schema";
import { roleLabel } from "../../users/user-list";
import { SettingsTabs } from "../settings-tabs";

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  canWrite: boolean;
  createdAt: string;
}

export default function ProfilePage() {
  const { update: updateSession } = useSession();
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Name form
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    void fetch("/api/users/me")
      .then((r) => r.json())
      .then((body) => {
        if (body.data) {
          setProfile(body.data);
          setName(body.data.name ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveName(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingName(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json();
        toast({
          title: "Failed to update name",
          description: body.error?.message ?? "Something went wrong.",
          variant: "destructive",
        });
      } else {
        setProfile((p) => (p ? { ...p, name } : p));
        await updateSession();
        toast({ title: "Name updated" });
      }
    } catch {
      toast({
        title: "Failed to update name",
        description: "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError("");

    // Inline validation replaces the native browser tooltip (the form sets
    // noValidate) so length errors match the app's styled alerts (#1038).
    if (newPassword.length < 8) {
      setPasswordError(PASSWORD_HINT);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Enter the same new password in both fields.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json();
        setPasswordError(body.error?.message ?? "Failed to change password");
        setSavingPassword(false);
      } else {
        // The change bumps passwordChangedAt, which the auth layer uses to
        // invalidate the current session. Rather than leave the user in a
        // fragile/dead session that strands the next request on a raw
        // "Unauthorized" (#1035), sign out cleanly and send them to login
        // with a clear message.
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        // Single success signal: the login page shows the confirmation
        // (passwordChanged=1). No inline alert + toast double-feedback (#1038).
        await signOut({ redirect: false });
        // Full reload, not router.push(): signOut() has just torn down the
        // session and the client cache must not survive into the login page.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login?passwordChanged=1";
      }
    } catch {
      setPasswordError("Something went wrong.");
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader
          breadcrumb={[{ label: "Settings" }, { label: "Profile" }]}
          title="Profile"
          tabs={<SettingsTabs />}
        />
        <div className="flex flex-1 items-start justify-center bg-page-ground py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        breadcrumb={[
          // This page is the Settings landing: the crumb is a label, not a
          // link to itself.
          { label: "Settings" },
          { label: "Profile" },
        ]}
        title="Profile"
        meta={profile?.email ? `Signed in as ${profile.email}` : undefined}
        tabs={<SettingsTabs />}
      />
      <div className="flex-1 space-y-4 bg-page-ground p-4 md:p-7">
        <SettingsSection title="Account" description="Your account details.">
          <dl className="m-0 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="m-0 font-medium">{profile?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="m-0 font-medium">
                {profile ? roleLabel(profile.role as UserRole) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Write access</dt>
              <dd className="m-0 font-medium">
                {profile?.canWrite ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="m-0 font-medium">
                {profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
        </SettingsSection>

        <form onSubmit={handleSaveName}>
          <SettingsSection
            title="Display name"
            description="This is how your name appears across NeoBoard."
            footer={
              <LoadingButton
                type="submit"
                loading={savingName}
                loadingText="Saving..."
                disabled={name === (profile?.name ?? "") || !name.trim()}
              >
                Save name
              </LoadingButton>
            }
          >
            <Field label="Name" id="profile-name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
          </SettingsSection>
        </form>

        <form onSubmit={handleChangePassword} noValidate>
          <SettingsSection
            title="Password"
            description="Update your password. You will need your current password."
            footer={
              <LoadingButton
                type="submit"
                loading={savingPassword}
                loadingText="Changing..."
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Change password
              </LoadingButton>
            }
          >
            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
            <Field label="Current password" id="current-password">
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password" id="new-password" help={PASSWORD_HINT}>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm new password" id="confirm-password">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
          </SettingsSection>
        </form>
      </div>
    </div>
  );
}

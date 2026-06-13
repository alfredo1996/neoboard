"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Badge,
  Alert,
  AlertDescription,
} from "@neoboard/components";
import { LoadingButton, PasswordInput } from "@neoboard/components";
import { useToast } from "@neoboard/components";

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
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((body) => {
        if (body.data) {
          setProfile(body.data);
          setName(body.data.name ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveName(e: React.FormEvent) {
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
          description: body.error ?? "Something went wrong.",
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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
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
        setPasswordError(body.error ?? "Failed to change password");
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
        setPasswordSuccess(true);
        toast({ title: "Password changed" });
        await signOut({ redirect: false });
        window.location.href = "/login?passwordChanged=1";
      }
    } catch {
      setPasswordError("Something went wrong.");
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Email</span>
              <p className="font-medium">{profile?.email ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Role</span>
              <div className="mt-1">
                <Badge
                  variant={
                    profile?.role === "admin"
                      ? "destructive"
                      : profile?.role === "reader"
                        ? "secondary"
                        : "default"
                  }
                  className="capitalize"
                >
                  {profile?.role}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Write Access</span>
              <p className="font-medium">{profile?.canWrite ? "Yes" : "No"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Member Since</span>
              <p className="font-medium">
                {profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Name */}
      <Card>
        <CardHeader>
          <CardTitle>Display Name</CardTitle>
          <CardDescription>
            This is how your name appears across NeoBoard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <LoadingButton
              type="submit"
              loading={savingName}
              loadingText="Saving..."
              disabled={name === (profile?.name ?? "") || !name.trim()}
            >
              Save
            </LoadingButton>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password. You will need your current password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
            {passwordSuccess && (
              <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                <AlertDescription>
                  Password changed successfully. You can continue using the
                  application.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>
            <LoadingButton
              type="submit"
              loading={savingPassword}
              loadingText="Changing..."
              disabled={!currentPassword || !newPassword || !confirmPassword}
            >
              Change Password
            </LoadingButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

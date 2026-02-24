"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signup } from "@/lib/auth/signup";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Alert,
  AlertDescription,
} from "@neoboard/components";
import {
  LoadingButton,
  PasswordInput,
} from "@neoboard/components";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);

  useEffect(() => {
    fetch("/api/auth/bootstrap-status")
      .then((r) => r.json())
      .then((data) => setBootstrapRequired(data.bootstrapRequired === true))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
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

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">NeoBoard</CardTitle>
          <CardDescription>
            {bootstrapRequired ? "First Admin Setup" : "Create your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bootstrapRequired && (
            <Alert className="mb-4">
              <AlertDescription>
                No users exist yet. You are setting up the first admin account.
                Enter the bootstrap token from your <code>.env</code> file.
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                name="password"
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                required
                minLength={6}
              />
            </div>

            {bootstrapRequired && (
              <div className="space-y-2">
                <Label htmlFor="bootstrapToken">Bootstrap Token</Label>
                <PasswordInput
                  id="bootstrapToken"
                  name="bootstrapToken"
                  required
                  placeholder="Enter ADMIN_BOOTSTRAP_TOKEN from .env"
                />
              </div>
            )}

            <LoadingButton
              type="submit"
              loading={loading}
              loadingText={
                bootstrapRequired ? "Creating admin..." : "Creating account..."
              }
              className="w-full"
            >
              {bootstrapRequired ? "Create Admin Account" : "Create account"}
            </LoadingButton>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

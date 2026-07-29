"use client";

import { Suspense, useState, useEffect, useSyncExternalStore } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { LoadingButton, PasswordInput } from "@neoboard/components";

/** Hydration probe helpers — module scope so the refs stay stable (#1272). */
const subscribeNoop = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  // Shown after a voluntary password change redirects here (#1035).
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Until React attaches onSubmit, a click runs the browser's NATIVE form
  // submit — a GET that puts email and password in the URL, and therefore in
  // history and access logs. Gate the button on hydration so that is
  // unreachable, and expose the state so callers can wait for interactivity
  // instead of clicking blind and retrying (#1272).
  // useSyncExternalStore is the idiomatic hydration probe: the server
  // snapshot is false, the client snapshot is true, and React swaps them
  // when hydration completes. No setState-in-effect, no cascading render.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    getHydratedSnapshot,
    getServerSnapshot,
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    try {
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
      } else if (result) {
        router.push(callbackUrl);
      } else {
        // Nothing returned → server unreachable
        setError("Unable to sign in. Please try again.");
        setLoading(false);
      }
    } catch {
      // Network error or server unreachable
      setError("Unable to reach server. Please check your connection.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-hydrated={hydrated ? "true" : "false"}
    >
      {passwordChanged && !error && (
        <Alert>
          <AlertDescription>
            Password changed. Please sign in with your new password.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          minLength={6}
        />
      </div>

      <LoadingButton
        type="submit"
        loading={loading}
        loadingText="Signing in..."
        className="w-full"
        disabled={!hydrated}
      >
        Sign in
      </LoadingButton>
    </form>
  );
}

export default function LoginPage() {
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/auth/bootstrap-status")
      .then((r) => r.json())
      .then((body) => {
        const payload = body?.data ?? body;
        setRegistrationEnabled(payload?.registrationEnabled !== false);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            <h1>NeoBoard</h1>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Visual dashboards for Neo4j &amp; PostgreSQL
          </p>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
        {registrationEnabled && (
          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

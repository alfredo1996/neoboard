"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Button,
  Alert,
  AlertDescription,
} from "@neoboard/components";
import { LoadingButton, PasswordInput } from "@neoboard/components";

interface SsoProviderInfo {
  id: string;
  name: string;
}

function SsoButtons({ providers }: { providers: SsoProviderInfo[] }) {
  if (providers.length === 0) return null;

  return (
    <div className="space-y-2">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          variant="outline"
          className="w-full"
          onClick={() => signIn("sso-" + provider.id, { callbackUrl: "/" })}
        >
          <Shield className="mr-2 h-4 w-4" />
          Sign in with {provider.name}
        </Button>
      ))}
    </div>
  );
}

function Divider() {
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-muted-foreground">
          or continue with
        </span>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        setError("Unable to sign in. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Unable to reach server. Please check your connection.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      >
        Sign in
      </LoadingButton>
    </form>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [ssoProviders, setSsoProviders] = useState<SsoProviderInfo[]>([]);
  const [ssoEnforced, setSsoEnforced] = useState(false);

  // Allow admins to bypass SSO enforcement via ?password=true
  const forcePassword = searchParams.get("password") === "true";

  useEffect(() => {
    fetch("/api/auth/bootstrap-status")
      .then((r) => r.json())
      .then((body) => {
        const payload = body?.data ?? body;
        setRegistrationEnabled(payload?.registrationEnabled !== false);
      })
      .catch(() => {});

    fetch("/api/auth/sso-providers")
      .then((r) => r.json())
      .then((body) => {
        const providers = body?.data ?? [];
        setSsoProviders(providers);
        if (body?.meta?.enforceSso) {
          setSsoEnforced(true);
        }
      })
      .catch(() => {});
  }, []);

  const showPasswordForm =
    !ssoEnforced || forcePassword || ssoProviders.length === 0;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">NeoBoard</CardTitle>
        <p className="text-sm text-muted-foreground">
          Visual dashboards for Neo4j &amp; PostgreSQL
        </p>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        {ssoProviders.length > 0 && <SsoButtons providers={ssoProviders} />}

        {ssoProviders.length > 0 && showPasswordForm && <Divider />}

        {showPasswordForm && <LoginForm />}

        {ssoEnforced && !forcePassword && ssoProviders.length > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link
              href="/login?password=true"
              className="text-primary underline"
            >
              Use password instead
            </Link>
          </p>
        )}
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
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense>
        <LoginPageContent />
      </Suspense>
    </div>
  );
}

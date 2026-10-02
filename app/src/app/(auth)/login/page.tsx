import { isRegistrationEnabled } from "@/lib/auth/registration";
import { safeCallbackPath } from "@/lib/auth/callback-path";
import { LoginForm } from "./login-form";

type SearchParams = Record<string, string | string[] | undefined>;

/** The first value, as URLSearchParams.get() returned it before #2169. */
const first = (value: string | string[] | undefined) => [value].flat()[0];

// A server component, so the first paint is the final layout (#2169).
export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const params = await searchParams;
  return (
    <LoginForm
      callbackUrl={safeCallbackPath(first(params.callbackUrl))}
      passwordChanged={first(params.passwordChanged) === "1"}
      registrationEnabled={isRegistrationEnabled()}
    />
  );
}

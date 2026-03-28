/**
 * Vitest setup for jsdom component tests in the app/ package.
 *
 * This file is loaded before tests in the "component" project (*.test.tsx).
 * It provides DOM cleanup, extended matchers, polyfills, and Next.js mocks.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Clean up DOM after each test to prevent state leaks
afterEach(() => cleanup());

// Polyfill ResizeObserver — required by Radix UI primitives (Dialog, Popover, etc.)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Polyfill IntersectionObserver — used by some lazy-loading components
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Next.js module mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    const { fill, priority, ...rest } = props;
    return <img {...rest} />;
  },
}));

// next/dynamic → render the component synchronously in tests
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<{ default: React.ComponentType }>, _opts?: unknown) => {
    // In test environment, resolve the dynamic import synchronously
    let Component: React.ComponentType | null = null;
    loader().then((mod) => {
      Component = mod.default;
    });
    return (props: Record<string, unknown>) =>
      Component ? <Component {...props} /> : <div data-testid="dynamic-loading" />;
  },
}));

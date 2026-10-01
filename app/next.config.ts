import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { resolve, sep } from "path";

const readJson = (...path: string[]) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, ...path), "utf8"));

// Loaded from node_modules, never bundled into the server: drivers with native
// bindings, dynamic requires or Node built-ins. Each package declares its own
// as `neoboard.serverExternalPackages`, the app for its metadata database and
// every connector for its drivers, which the connector codegen collects. A
// package named here is one more line each new connector must edit (#2067).
const serverExternalPackages: string[] = [
  ...readJson("package.json").neoboard.serverExternalPackages,
  ...readJson(
    "..",
    "connection",
    "src",
    "server-external-packages.generated.json",
  ),
];

// A declared package stays external only where the importing file loads the
// copy the app root does, the check Next applies to serverExternalPackages. A
// driver npm nested at another version is bundled instead of being required
// from the root at the wrong version (#2067).
const nodeRequire = createRequire(import.meta.url);
const sameCopyExternal = async ({
  context,
  request,
}: {
  context?: string;
  request?: string;
}) => {
  if (!context || !request || !serverExternalPackages.includes(request)) {
    return;
  }
  const from = (dir: string) => nodeRequire.resolve(request, { paths: [dir] });
  try {
    if (from(context) === from(import.meta.dirname)) return request;
  } catch {
    // Unresolvable from either side: bundle it, as Next would.
  }
};

// Canonicalise all mobx imports to the single copy installed under component/
// to prevent the "multiple mobx instances" MobX warning when @neo4j-nvl
// is transpiled via transpilePackages.
const mobxPath = resolve(
  import.meta.dirname,
  "..",
  "component",
  "node_modules",
  "mobx",
);

const componentSrc = resolve(import.meta.dirname, "..", "component", "src");

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    resolveAlias: {
      mobx: mobxPath,
    },
  },
  // Enable source maps in production for E2E coverage collection (nextcov).
  productionBrowserSourceMaps: process.env.E2E_COVERAGE === "1",
  outputFileTracingRoot: resolve(import.meta.dirname, ".."),
  transpilePackages: [
    "@neoboard/components",
    "@neoboard/connection",
    "@neoboard/connector-sdk",
  ],
  serverExternalPackages,
  async headers() {
    const baseHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];

    // HSTS must NOT be sent on plain-HTTP local/demo deployments — once a
    // browser sees it on http://localhost it will refuse plain HTTP to that
    // origin for up to a year. Default: off. Opt in via FORCE_HTTPS=true
    // (set this on production deployments served over HTTPS).
    if (process.env.FORCE_HTTPS === "true") {
      baseHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        source: "/:path*",
        headers: baseHeaders,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // The instrumentation file is compiled in a separate webpack pass that does
      // not always honour serverExternalPackages. Mark them external there too,
      // so webpack never tries to bundle their Node.js built-in imports (net,
      // tls, stream, crypto) in that compilation.
      config.externals = [...[config.externals ?? []].flat(), sameCopyExternal];
    }

    // Enable full source maps for E2E coverage collection.
    if (process.env.E2E_COVERAGE === "1") {
      config.devtool = "source-map";
    }

    // Canonicalise mobx to a single instance to avoid MobX "multiple instances" warning.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      mobx: mobxPath,
    };

    // When transpilePackages includes @neoboard/components, webpack resolves
    // the component library's bare imports (echarts, @neo4j-nvl, etc.) from
    // the app's node_modules context. In CI, each package runs `npm ci` in
    // isolation, so deps installed only in component/node_modules/ aren't
    // visible to the app's webpack resolver. Adding component/node_modules
    // to resolve.modules fixes this without duplicating dependencies.
    config.resolve.modules = [
      ...(config.resolve.modules ?? []),
      resolve(import.meta.dirname, "..", "component", "node_modules"),
      "node_modules",
    ];

    // The component library uses @/ as a path alias pointing to its own src/.
    // The app also uses @/ (via tsconfig paths) pointing to app/src/.
    // We need to resolve @/ differently based on which package the import originates from.
    config.resolve.plugins = config.resolve.plugins || [];
    config.resolve.plugins.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apply(resolver: any) {
        const target = resolver.ensureHook("resolve");
        resolver.getHook("described-resolve").tapAsync(
          "ComponentLibraryAlias",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (request: any, resolveContext: any, callback: any) => {
            const innerRequest = request.request;
            if (!innerRequest || !innerRequest.startsWith("@/")) {
              return callback();
            }

            // Only intercept imports from files inside the component library
            const issuer = request.context?.issuer || "";
            const componentMarker = `${sep}component${sep}src${sep}`;
            if (!issuer.includes(componentMarker)) {
              return callback();
            }

            // Rewrite @/ to point to component/src/
            const relativePath = innerRequest.slice(2); // strip "@/"
            const obj = {
              ...request,
              request: resolve(componentSrc, relativePath),
            };

            return resolver.doResolve(
              target,
              obj,
              `Resolved @/ for component library`,
              resolveContext,
              callback,
            );
          },
        );
      },
    });

    return config;
  },
  async redirects() {
    return [
      {
        // #914 — Widget Lab renamed to Widget Library. Permanent 308 so
        // bookmarked URLs survive and SEO carries to the new path.
        source: "/widget-lab",
        destination: "/widget-library",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

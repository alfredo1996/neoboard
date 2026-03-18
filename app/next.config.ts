import type { NextConfig } from "next";
import { resolve, sep } from "path";

// Canonicalise all mobx imports to the single copy installed under component/
// to prevent the "multiple mobx instances" MobX warning when @neo4j-nvl
// is transpiled via transpilePackages.
const mobxPath = resolve(import.meta.dirname, "..", "component", "node_modules", "mobx");

const componentSrc = resolve(import.meta.dirname, "..", "component", "src");

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      mobx: mobxPath,
    },
  },
  // Enable source maps in production for E2E coverage collection (nextcov).
  productionBrowserSourceMaps: process.env.E2E_COVERAGE === "1",
  outputFileTracingRoot: resolve(import.meta.dirname, ".."),
  transpilePackages: ["@neoboard/components"],
  serverExternalPackages: ["connection", "postgres"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // The instrumentation file is compiled in a separate webpack pass that does
      // not always honour serverExternalPackages. Explicitly mark postgres as an
      // external so webpack never tries to bundle its Node.js built-in imports
      // (net, tls, stream, crypto) in that compilation.
      const prev = config.externals;
      config.externals = Array.isArray(prev)
        ? [...prev, "postgres"]
        : prev
          ? [prev, "postgres"]
          : ["postgres"];
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

    // The @neo4j-cypher/react-codemirror package's syntaxValidation module
    // imports workerpool which tries to require('child_process') and
    // require('worker_threads'). These Node.js builtins aren't available
    // in the browser bundle. We pass lint: false to cypher() so the linter
    // (and thus workerpool) is never actually invoked at runtime.
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        child_process: false,
        worker_threads: false,
      };
    }

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
};

export default nextConfig;

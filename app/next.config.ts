import type { NextConfig } from "next";
import { resolve, sep } from "path";

const componentSrc = resolve(import.meta.dirname, "..", "component", "src");

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(import.meta.dirname, ".."),
  transpilePackages: ["@neoboard/components"],
  serverExternalPackages: ["connection", "neo4j-driver", "pg"],
  webpack: (config) => {
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

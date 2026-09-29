import { describe, it, expect } from "vitest";
import { createServer, type AddressInfo, type Server } from "node:net";
import { isPortAvailable } from "../../lib/ports.js";

// Real sockets: what matters is how the OS answers a bind, which a mocked
// `node:net` cannot tell us. On macOS a bind on one address succeeds while
// another socket holds the same port on a different one (#2057).
function hold(host: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => resolve(server));
  });
}

const close = (server: Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

describe("isPortAvailable", () => {
  it("returns true when the port is free", async () => {
    const server = await hold("127.0.0.1");
    const { port } = server.address() as AddressInfo;
    await close(server);
    expect(await isPortAvailable(port)).toBe(true);
  });

  // 0.0.0.0 and :: are how Docker publishes a port by default; 127.0.0.1 is
  // how a container published on loopback, or a local server, holds one.
  it.each(["127.0.0.1", "0.0.0.0", "::"])(
    "returns false when another socket holds the port on %s",
    async (host) => {
      const server = await hold(host);
      const { port } = server.address() as AddressInfo;
      try {
        expect(await isPortAvailable(port)).toBe(false);
      } finally {
        await close(server);
      }
    },
  );
});

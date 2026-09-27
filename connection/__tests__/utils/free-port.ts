import { createServer, type AddressInfo } from "node:net";

/**
 * A host port nothing holds now. A constant port made two runs at once (two
 * checkouts) both claim it: "port is already allocated" (#1929).
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Start something bound to a free host port, fixed for the run. The port can
 * be taken between freePort() and Docker's bind; Docker then answers "port is
 * already allocated" and another is picked, up to three times.
 */
export async function onFreePort<T>(
  start: (port: number) => Promise<T>,
): Promise<{ value: T; port: number }> {
  for (let attempt = 1; ; attempt++) {
    const port = await freePort();
    try {
      return { value: await start(port), port };
    } catch (e) {
      if (attempt >= 3 || !/port is already allocated/i.test(String(e))) {
        throw e;
      }
    }
  }
}

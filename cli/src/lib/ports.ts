import { createServer } from "node:net";

/**
 * Every address a Compose-published port binds, plus loopback. On macOS a
 * bind on one address succeeds while another socket holds the same port on a
 * different one, so each probe catches what the others miss: 127.0.0.1 a
 * loopback-published container or local server, 0.0.0.0 and :: a port Docker
 * publishes by default (#2057).
 */
const HOSTS = ["127.0.0.1", "0.0.0.0", "::"];

function bindable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err: NodeJS.ErrnoException) =>
      // No IPv6 on this machine: nothing can hold the port there. Only the
      // :: probe gets that pass; any other failure means the port is taken.
      resolve(
        host === "::" &&
          (err.code === "EAFNOSUPPORT" || err.code === "EADDRNOTAVAIL"),
      ),
    );
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function isPortAvailable(port: number): Promise<boolean> {
  // One at a time: probes on overlapping addresses would collide with each other.
  for (const host of HOSTS) {
    if (!(await bindable(port, host))) return false;
  }
  return true;
}

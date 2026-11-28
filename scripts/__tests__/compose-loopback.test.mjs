import { describe, it, expect } from "vitest";
import { resolve } from "./compose-config.mjs";

// The full stack is what the one-line installer runs (#1314), with the
// repo-public database passwords. On a Linux host Docker-published ports
// bypass the firewall, so a database bound to every interface is open to the
// network. The app port stays public: that is the product.
describe("the full stack publishes its databases on loopback only (#1314)", () => {
  const { services } = resolve("docker-compose.full.yml");

  it.each(["postgres", "neo4j"])("%s", (name) => {
    const ports = services[name].ports;
    expect(ports.length).toBeGreaterThan(0);
    expect(ports.map((p) => p.host_ip)).toEqual(ports.map(() => "127.0.0.1"));
  });
});

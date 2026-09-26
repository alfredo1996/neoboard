/**
 * The budget for a beforeAll that starts a Testcontainers container (#1944).
 * A full run starts several at once, all competing for Docker, and a 30 s
 * budget sized for an idle machine was exceeded by contention alone. Two
 * minutes stays far above that and still fails a start that hangs.
 */
export const CONTAINER_START_MS = 120_000;

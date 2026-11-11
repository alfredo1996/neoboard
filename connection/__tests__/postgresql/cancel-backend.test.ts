import { EventEmitter } from "events";

const clients: FakeClient[] = [];

class FakeClient extends EventEmitter {
  config: { query_timeout?: number };
  end = jest.fn().mockResolvedValue(undefined);
  connect = jest.fn().mockResolvedValue(undefined);
  // A stalled backend: only the driver's own query_timeout ends the query.
  query = jest.fn(
    () =>
      new Promise((_, reject) => {
        const ms = this.config.query_timeout;
        if (ms) setTimeout(() => reject(new Error("Query read timeout")), ms);
      }),
  );
  constructor(config: { query_timeout?: number }) {
    super();
    this.config = config;
    clients.push(this);
  }
}

jest.mock("pg", () => ({ Client: FakeClient }));

import { cancelBackendOnAbort } from "../../src/postgresql/utils";

// #2444: the short-lived cancel connection is bounded by the driver, so a
// stalled cancel cannot hold a socket forever.
describe("cancelBackendOnAbort — a stalled cancel is bounded", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clients.length = 0;
  });
  afterEach(() => jest.useRealTimers());

  it("gives the cancel client a query_timeout and ends it when the query stalls", async () => {
    const controller = new AbortController();
    cancelBackendOnAbort(
      { options: {} } as any,
      { processID: 42 } as any,
      controller.signal,
      "neoboard-tag",
    );
    controller.abort();
    await jest.advanceTimersByTimeAsync(0);

    const canceller = clients[0];
    expect(canceller.config.query_timeout).toBeGreaterThan(0);
    expect(canceller.end).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(canceller.config.query_timeout!);
    expect(canceller.end).toHaveBeenCalledTimes(1);
  });
});

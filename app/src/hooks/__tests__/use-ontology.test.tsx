import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useEditorTerms,
  useOntology,
  useRefreshOntology,
  useSaveTerms,
} from "@/hooks/use-ontology";

const mockToast = vi.fn();
vi.mock("@neoboard/components", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const fetchMock = vi.fn();
const ok = (terms: unknown[]) =>
  new Response(JSON.stringify({ data: { terms }, error: null, meta: null }), {
    status: 200,
  });
const fails = (message: string) =>
  new Response(
    JSON.stringify({ data: null, error: { code: "x", message }, meta: null }),
    {
      status: 400,
    },
  );

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const meaning = { kind: "entity", key: "A", parentKey: "", hidden: true };

describe("use-ontology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the terms of a connection", async () => {
    fetchMock.mockResolvedValue(ok([{ key: "A" }]));
    const { wrapper } = setup();
    const { result } = renderHook(() => useOntology("c1"), { wrapper });
    await waitFor(() => expect(result.current.data?.terms).toHaveLength(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/connections/c1/ontology");
  });

  it("the Model page's refresh asks the server to read the database again, every time; a plain refetch does not", async () => {
    fetchMock.mockImplementation(async () => ok([{ key: "A" }]));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ q: useOntology("c1"), refresh: useRefreshOntology("c1") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.q.data).toBeDefined());
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      await result.current.q.refetch(); // "Try again"
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/connections/c1/ontology",
      "/api/connections/c1/ontology?refresh=1",
      "/api/connections/c1/ontology?refresh=1",
      "/api/connections/c1/ontology",
    ]);
  });

  it("a refresh whose first request fails before the server keeps its flag for the retry", async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => {
      if (++n === 2) throw new TypeError("network");
      return ok([{ key: "A" }]);
    });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ q: useOntology("c1"), refresh: useRefreshOntology("c1") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.q.data).toBeDefined());
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(n).toBe(3), { timeout: 4000 });
    await act(async () => {
      await result.current.q.refetch();
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/connections/c1/ontology",
      "/api/connections/c1/ontology?refresh=1",
      "/api/connections/c1/ontology?refresh=1",
      "/api/connections/c1/ontology",
    ]);
  });

  it("keeps one refresh function across renders, and leaves TanStack's result unwrapped", async () => {
    fetchMock.mockImplementation(async () => ok([{ key: "A" }]));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      () => ({ q: useOntology("c1"), refresh: useRefreshOntology("c1") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.q.data).toBeDefined());
    const first = result.current;
    rerender();
    expect(result.current.refresh).toBe(first.refresh);
    expect(result.current.q.refetch).toBe(first.q.refetch);
  });

  it("a Refresh with no query mounted does not mark the next ordinary read", async () => {
    fetchMock.mockImplementation(async () => ok([{ key: "A" }]));
    const { wrapper } = setup();
    const { result: idle } = renderHook(() => useRefreshOntology("c1"), {
      wrapper,
    });
    await act(async () => {
      await idle.current();
    });
    renderHook(() => useOntology("c1"), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      fetchMock.mock.calls.every(
        (c) => c[0] === "/api/connections/c1/ontology",
      ),
    ).toBe(true);
  });

  it("hands the editor only the live terms that were described or hidden", async () => {
    const t = (over: object) => ({
      kind: "entity",
      parentKey: "",
      displayName: "",
      description: "",
      hidden: false,
      orphaned: false,
      ...over,
    });
    fetchMock.mockResolvedValue(
      ok([
        t({ key: "plain" }),
        t({ key: "named", displayName: "N" }),
        t({ key: "said", description: "d" }),
        t({ key: "hid", hidden: true }),
        t({ key: "gone", hidden: true, orphaned: true }),
      ]),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useEditorTerms("c1"), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.map((x) => x.key)).toEqual(["named", "said", "hid"]);
  });

  it("asks for no terms until a connection is chosen", () => {
    const { wrapper } = setup();
    renderHook(() => useEditorTerms(""), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const term = (key: string, over: object = {}) => ({
    kind: "entity",
    key,
    parentKey: "",
    displayName: "",
    description: "",
    hidden: false,
    orphaned: false,
    ...over,
  });

  it("puts the terms and shows them in the cache at once", async () => {
    fetchMock.mockResolvedValue(ok([]));
    const { client, wrapper } = setup();
    client.setQueryData(["ontology", "c1"], { terms: [term("A")] });
    const { result } = renderHook(() => useSaveTerms("c1"), { wrapper });
    await act(() => result.current.mutateAsync([meaning]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/connections/c1/ontology");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ terms: [meaning] });
    expect(client.getQueryData(["ontology", "c1"])).toEqual({
      terms: [term("A", { hidden: true })],
    });
  });

  it("keeps both edits when two saves answer in reverse order (#2534)", async () => {
    // Each PUT answers with the whole list as the server held it then, so the
    // older answer, landing last, carries neither of the later edits.
    const answers: Array<(r: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => answers.push(resolve)),
    );
    const { client, wrapper } = setup();
    client.setQueryData(["ontology", "c1"], {
      terms: [term("A"), term("B")],
    });
    const { result } = renderHook(() => useSaveTerms("c1"), { wrapper });
    act(() => {
      result.current.mutate([
        { ...meaning, hidden: undefined, key: "A", displayName: "one" },
      ]);
      result.current.mutate([
        { ...meaning, hidden: undefined, key: "B", displayName: "two" },
      ]);
    });
    await waitFor(() => expect(answers).toHaveLength(2));
    await act(async () => {
      answers[1](
        ok([
          term("A", { displayName: "one" }),
          term("B", { displayName: "two" }),
        ]),
      );
    });
    await act(async () => {
      answers[0](ok([term("A", { displayName: "one" }), term("B")]));
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(client.getQueryData(["ontology", "c1"])).toEqual({
      terms: [
        term("A", { displayName: "one" }),
        term("B", { displayName: "two" }),
      ],
    });
  });

  it("reads the terms again once the last pending save settles (#2534)", async () => {
    fetchMock.mockResolvedValue(ok([]));
    const { client, wrapper } = setup();
    client.setQueryData(["ontology", "c1"], { terms: [term("A")] });
    const { result } = renderHook(() => useSaveTerms("c1"), { wrapper });
    await act(() => result.current.mutateAsync([meaning]));
    expect(client.getQueryState(["ontology", "c1"])?.isInvalidated).toBe(true);
  });

  it("reads the terms again only after the last of two pending saves settles (#2534)", async () => {
    const answers: Array<(r: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => answers.push(resolve)),
    );
    const { client, wrapper } = setup();
    client.setQueryData(["ontology", "c1"], { terms: [term("A")] });
    const { result } = renderHook(() => useSaveTerms("c1"), { wrapper });
    act(() => {
      result.current.mutate([meaning]);
      result.current.mutate([meaning]);
    });
    await waitFor(() => expect(answers).toHaveLength(2));
    await act(async () => answers[0](ok([])));
    await waitFor(() => expect(client.isMutating()).toBe(1));
    expect(client.getQueryState(["ontology", "c1"])?.isInvalidated).toBe(false);
    await act(async () => answers[1](ok([])));
    await waitFor(() =>
      expect(client.getQueryState(["ontology", "c1"])?.isInvalidated).toBe(
        true,
      ),
    );
  });

  it("tells the user about every failed save, not only the latest", async () => {
    fetchMock.mockResolvedValue(fails("The connection has no entity"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveTerms("c1"), { wrapper });
    await act(async () => {
      result.current.mutate([meaning]);
      result.current.mutate([{ ...meaning, key: "B" }]);
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(2));
    expect(mockToast.mock.calls[0][0]).toMatchObject({
      title: "Could not save",
      variant: "destructive",
    });
  });
});

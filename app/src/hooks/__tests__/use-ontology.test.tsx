import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useEditorTerms,
  useOntology,
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

  it("puts the terms and replaces the cache with the answer", async () => {
    fetchMock.mockResolvedValue(ok([{ key: "saved" }]));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useSaveTerms("c1"), { wrapper });
    await act(() => result.current.mutateAsync([meaning]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/connections/c1/ontology");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ terms: [meaning] });
    expect(client.getQueryData(["ontology", "c1"])).toEqual({
      terms: [{ key: "saved" }],
    });
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

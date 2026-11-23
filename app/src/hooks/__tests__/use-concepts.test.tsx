import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useConcepts,
  useDeleteConcept,
  useSaveConcept,
} from "@/hooks/use-concepts";

const fetchMock = vi.fn();
const ok = (data: unknown) =>
  new Response(JSON.stringify({ data, error: null, meta: null }), {
    status: 200,
  });

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const input = {
  name: "Customer",
  parameter: "customer",
  description: "",
  sides: [{ connectionId: "c1", entityKey: "A", keyPropertyKey: "id" }],
};

describe("use-concepts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the concepts", async () => {
    fetchMock.mockResolvedValue(ok({ concepts: [{ id: "k1" }] }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useConcepts(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "k1" }]));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ontology/concepts");
  });

  it("reads nothing while disabled (#2556)", async () => {
    const { wrapper } = setup();
    renderHook(() => useConcepts({ enabled: false }), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["creates", undefined, "POST", "/api/ontology/concepts"],
    ["replaces", "k1", "PATCH", "/api/ontology/concepts/k1"],
  ])("%s a concept, and reads the list again", async (_w, id, method, url) => {
    fetchMock.mockResolvedValue(ok({}));
    const { client, wrapper } = setup();
    const refetch = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveConcept(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ ...input, ...(id && { id }) }),
    );
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init.method).toBe(method);
    // The id travels in the URL, never in the body.
    expect(JSON.parse(init.body)).toEqual(input);
    expect(refetch).toHaveBeenCalledWith({
      queryKey: ["ontology-concepts"],
    });
  });

  it("throws the server's message when a save is refused", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          error: { code: "CONFLICT", message: "already exists" },
          meta: null,
        }),
        { status: 409 },
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveConcept(), { wrapper });
    await expect(result.current.mutateAsync(input)).rejects.toThrow(
      "already exists",
    );
  });

  it("deletes a concept by id", async () => {
    fetchMock.mockResolvedValue(ok({ id: "k1" }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useDeleteConcept(), { wrapper });
    await act(() => result.current.mutateAsync("k1"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ontology/concepts/k1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("ParamDate — store interactions", () => {
  beforeEach(resetStore);

  it("stores an ISO date string", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter(
      "eventDate",
      "2024-06-15",
      "Parameter Selector",
      "eventDate",
      "date",
      "selector-widget",
    );
    expect(useParameterStore.getState().parameters["eventDate"].value).toBe(
      "2024-06-15",
    );
  });

  it("preserves Date object when stored via setParameter", () => {
    const { setParameter } = useParameterStore.getState();
    const d = new Date("2024-06-15T00:00:00Z");
    setParameter(
      "created",
      d,
      "Parameter Selector",
      "created",
      "date",
      "selector-widget",
    );
    const entry = useParameterStore.getState().parameters["created"];
    expect(entry.value).toBeInstanceOf(Date);
    expect((entry.value as Date).toISOString()).toBe(
      "2024-06-15T00:00:00.000Z",
    );
  });
});

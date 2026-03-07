import { describe, it, expect, beforeEach } from "vitest";
import { useConnectionStore } from "../connection-store";

describe("useConnectionStore", () => {
  beforeEach(() => {
    useConnectionStore.getState().reset();
  });

  it("initializes with null activeConnectionId and empty widgetConnections", () => {
    const state = useConnectionStore.getState();
    expect(state.activeConnectionId).toBeNull();
    expect(state.widgetConnections).toEqual({});
  });

  it("setActiveConnection updates activeConnectionId", () => {
    useConnectionStore.getState().setActiveConnection("conn-1");
    expect(useConnectionStore.getState().activeConnectionId).toBe("conn-1");
  });

  it("setActiveConnection to null clears it", () => {
    useConnectionStore.getState().setActiveConnection("conn-1");
    useConnectionStore.getState().setActiveConnection(null);
    expect(useConnectionStore.getState().activeConnectionId).toBeNull();
  });

  it("setWidgetConnection adds a widget-to-connection mapping", () => {
    useConnectionStore.getState().setWidgetConnection("w1", "conn-1");
    expect(useConnectionStore.getState().widgetConnections).toEqual({ w1: "conn-1" });
  });

  it("setWidgetConnection overwrites existing mapping", () => {
    useConnectionStore.getState().setWidgetConnection("w1", "conn-1");
    useConnectionStore.getState().setWidgetConnection("w1", "conn-2");
    expect(useConnectionStore.getState().widgetConnections.w1).toBe("conn-2");
  });

  it("multiple widgets can map to different connections", () => {
    useConnectionStore.getState().setWidgetConnection("w1", "conn-1");
    useConnectionStore.getState().setWidgetConnection("w2", "conn-2");
    expect(useConnectionStore.getState().widgetConnections).toEqual({
      w1: "conn-1",
      w2: "conn-2",
    });
  });

  it("removeWidgetConnection removes a specific mapping", () => {
    useConnectionStore.getState().setWidgetConnection("w1", "conn-1");
    useConnectionStore.getState().setWidgetConnection("w2", "conn-2");
    useConnectionStore.getState().removeWidgetConnection("w1");
    expect(useConnectionStore.getState().widgetConnections).toEqual({ w2: "conn-2" });
  });

  it("removeWidgetConnection on non-existent widget is a no-op", () => {
    useConnectionStore.getState().setWidgetConnection("w1", "conn-1");
    useConnectionStore.getState().removeWidgetConnection("w999");
    expect(useConnectionStore.getState().widgetConnections).toEqual({ w1: "conn-1" });
  });

  it("reset clears all state", () => {
    useConnectionStore.getState().setActiveConnection("conn-1");
    useConnectionStore.getState().setWidgetConnection("w1", "conn-1");
    useConnectionStore.getState().reset();
    const state = useConnectionStore.getState();
    expect(state.activeConnectionId).toBeNull();
    expect(state.widgetConnections).toEqual({});
  });
});

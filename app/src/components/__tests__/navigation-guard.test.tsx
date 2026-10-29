import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { useEffect } from "react";
import {
  NavigationGuardProvider,
  useNavigationGuard,
} from "../navigation-guard";
import { useDashboardStore } from "../../stores/dashboard-store";

function Asker() {
  const guard = useNavigationGuard();
  useEffect(() => {
    guard("/x");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ask once
  }, []);
  return null;
}

describe("NavigationGuardProvider (#2325)", () => {
  beforeEach(() => {
    useDashboardStore.getState().reset();
    useDashboardStore.getState().setLayout({
      version: 2,
      pages: [{ id: "p1", title: "P", widgets: [], gridLayout: [] }],
    });
    window.history.replaceState(null, "", "/d1/edit");
  });

  it("Escape cancels the question", () => {
    act(() => useDashboardStore.getState().addPage());
    render(
      <NavigationGuardProvider>
        <Asker />
      </NavigationGuardProvider>,
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

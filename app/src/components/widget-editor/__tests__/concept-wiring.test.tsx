import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { InteractionSection } from "../interaction-section";
import { ConceptSelectorStart } from "../concept-selector-start";
import type { Concept } from "@/hooks/use-concepts";

const store = () => useWidgetEditorStore.getState();
const PAGES = [{ id: "p1", title: "Overview" }];

const side = (entityKey: string, keyPropertyKey: string) => ({
  connectionId: "pg",
  entityKey,
  keyPropertyKey,
});
const CUSTOMER: Concept = {
  id: "c1",
  name: "Customer",
  parameter: "customer",
  description: "",
  sides: [side("customers", "email"), side("orders", "customer_email")],
};

beforeEach(() => {
  useWidgetEditorStore.setState({
    clickActionEnabled: true,
    actionRules: [],
    title: "",
    paramWidgetName: "",
  });
});

describe("Click action offers concepts (#2485)", () => {
  const open = (field: string, connectionId = "pg") => {
    useWidgetEditorStore.setState({
      chartType: "table",
      connectionId,
      availableFields: [field],
      actionRules: [
        {
          id: "r1",
          type: "set-parameter",
          triggerColumn: field,
          parameterMapping: { parameterName: "", sourceField: field },
        },
      ],
    });
    render(
      <InteractionSection
        clickActionCollisions={[]}
        pages={PAGES}
        concepts={[CUSTOMER]}
      />,
    );
  };

  it.each(["email", "customer_email"])(
    "offers Set Customer on %s, a key on the connection, and saves the plain parameter",
    (field) => {
      open(field);
      fireEvent.click(
        screen.getByRole("button", {
          name: `Set Customer ($customer) to this ${field}`,
        }),
      );
      expect(store().actionRules[0].parameterMapping).toEqual({
        parameterName: "customer",
        sourceField: field,
      });
      expect(Object.keys(store().actionRules[0])).not.toContain("conceptId");
    },
  );

  it.each([
    ["a field that is no key", "total", "pg"],
    ["a connection with no side", "email", "other"],
  ])("offers nothing for %s", (_, field, connectionId) => {
    open(field, connectionId);
    expect(screen.queryByRole("button", { name: /^Set Customer/ })).toBeNull();
  });
});

describe("New selector for a concept (#2485)", () => {
  it("names the selector after the concept and sets its plain parameter", () => {
    render(<ConceptSelectorStart concepts={[CUSTOMER]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "New selector for Customer" }),
    );
    expect(store().title).toBe("Customer");
    expect(store().paramWidgetName).toBe("customer");
  });

  it("offers nothing without a concept", () => {
    render(<ConceptSelectorStart concepts={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

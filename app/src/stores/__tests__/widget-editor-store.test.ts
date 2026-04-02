import { describe, it, expect, beforeEach } from "vitest";
import { useWidgetEditorStore } from "../widget-editor-store";

function getState() {
  return useWidgetEditorStore.getState();
}

describe("widget-editor-store", () => {
  beforeEach(() => {
    getState().resetForAdd();
  });

  describe("initial state", () => {
    it("defaults to bar chart with empty connection", () => {
      expect(getState().chartType).toBe("bar");
      expect(getState().connectionId).toBe("");
      expect(getState().query).toBe("");
      expect(getState().title).toBe("");
    });

    it("defaults to styling and click action disabled", () => {
      expect(getState().stylingEnabled).toBe(false);
      expect(getState().clickActionEnabled).toBe(false);
    });

    it("defaults to dialog step 'main'", () => {
      expect(getState().dialogStep).toBe("main");
    });
  });

  describe("setChartType", () => {
    it("updates chart type and resets chart options", () => {
      getState().setChartType("pie");
      expect(getState().chartType).toBe("pie");
      // Chart options should be reset to defaults for new type
      expect(getState().chartOptions).toBeDefined();
    });

    it("disables click action for unsupported types", () => {
      getState().setClickActionEnabled(true);
      getState().setChartType("single-value"); // doesn't support click action
      expect(getState().clickActionEnabled).toBe(false);
    });

    it("disables styling for unsupported types", () => {
      getState().setStylingEnabled(true);
      getState().setChartType("json"); // doesn't support styling
      expect(getState().stylingEnabled).toBe(false);
    });
  });

  describe("setChartOptions", () => {
    it("accepts a direct object", () => {
      getState().setChartOptions({ colorPalette: "neon" });
      expect(getState().chartOptions).toEqual({ colorPalette: "neon" });
    });

    it("accepts an updater function", () => {
      getState().setChartOptions({ existing: true });
      getState().setChartOptions((prev) => ({ ...prev, added: "new" }));
      expect(getState().chartOptions).toEqual({ existing: true, added: "new" });
    });
  });

  describe("resetForAdd", () => {
    it("resets all state to initial values", () => {
      getState().setChartType("pie");
      getState().setConnectionId("conn-1");
      getState().setQuery("MATCH (n) RETURN n");
      getState().setTitle("Test");
      getState().setStylingEnabled(true);
      getState().setClickActionEnabled(true);

      getState().resetForAdd();

      expect(getState().chartType).toBe("bar");
      expect(getState().connectionId).toBe("");
      expect(getState().query).toBe("");
      expect(getState().title).toBe("");
      expect(getState().stylingEnabled).toBe(false);
      expect(getState().clickActionEnabled).toBe(false);
    });
  });

  describe("loadFromWidget", () => {
    it("loads basic widget properties", () => {
      getState().loadFromWidget({
        id: "w1",
        chartType: "table",
        connectionId: "conn-neo4j",
        query: "MATCH (n) RETURN n",
        settings: { title: "My Table" },
      });

      expect(getState().chartType).toBe("table");
      expect(getState().connectionId).toBe("conn-neo4j");
      expect(getState().query).toBe("MATCH (n) RETURN n");
      expect(getState().title).toBe("My Table");
    });

    it("loads styling rules", () => {
      getState().loadFromWidget({
        id: "w1",
        chartType: "bar",
        connectionId: "c1",
        query: "q",
        settings: {
          stylingConfig: {
            enabled: true,
            rules: [{ id: "r1", operator: ">=", value: 5, color: "#f00" }],
          },
        },
      });

      expect(getState().stylingEnabled).toBe(true);
      expect(getState().stylingRules).toHaveLength(1);
      expect(getState().stylingRules[0].color).toBe("#f00");
    });

    it("loads click action with parameter mapping", () => {
      getState().loadFromWidget({
        id: "w1",
        chartType: "bar",
        connectionId: "c1",
        query: "q",
        settings: {
          clickAction: {
            type: "set-parameter",
            parameterMapping: {
              parameterName: "year",
              sourceField: "released",
            },
          },
        },
      });

      expect(getState().clickActionEnabled).toBe(true);
      expect(getState().parameterName).toBe("year");
      expect(getState().sourceField).toBe("released");
    });

    it("loads color scales", () => {
      getState().loadFromWidget({
        id: "w1",
        chartType: "table",
        connectionId: "c1",
        query: "q",
        settings: {
          conditionalFormatting: {
            colorScales: [
              { column: "score", minColor: "#f00", maxColor: "#0f0" },
            ],
          },
        },
      });

      expect(getState().colorScales).toHaveLength(1);
      expect(getState().colorScales[0].column).toBe("score");
    });

    it("migrates legacy colorThresholds to styling rules", () => {
      getState().loadFromWidget({
        id: "w1",
        chartType: "bar",
        connectionId: "c1",
        query: "q",
        settings: {
          chartOptions: {
            colorThresholds:
              '[{"value":50,"color":"#aaa"},{"value":100,"color":"#bbb"}]',
          },
        },
      });

      expect(getState().stylingEnabled).toBe(true);
      expect(getState().stylingRules).toHaveLength(2);
    });
  });

  describe("buildStylingConfig", () => {
    it("returns undefined when styling disabled", () => {
      expect(getState().buildStylingConfig()).toBeUndefined();
    });

    it("returns config when styling enabled", () => {
      getState().setStylingEnabled(true);
      getState().setStylingRules([
        { id: "r1", operator: ">=", value: 5, color: "#f00" },
      ]);
      const config = getState().buildStylingConfig();
      expect(config?.enabled).toBe(true);
      expect(config?.rules).toHaveLength(1);
    });

    it("returns undefined for unsupported chart types", () => {
      getState().setChartType("json");
      getState().setStylingEnabled(true);
      expect(getState().buildStylingConfig()).toBeUndefined();
    });
  });

  describe("buildClickAction", () => {
    it("returns undefined when click action disabled", () => {
      expect(getState().buildClickAction()).toBeUndefined();
    });

    it("builds set-parameter action", () => {
      getState().setClickActionEnabled(true);
      getState().setClickActionType("set-parameter");
      getState().setParameterName("year");
      getState().setSourceField("released");
      const action = getState().buildClickAction();
      expect(action?.type).toBe("set-parameter");
      expect(action?.parameterMapping?.parameterName).toBe("year");
    });

    it("returns undefined for empty parameter name", () => {
      getState().setClickActionEnabled(true);
      getState().setClickActionType("set-parameter");
      getState().setParameterName("");
      expect(getState().buildClickAction()).toBeUndefined();
    });

    it("uses action rules when present", () => {
      getState().setClickActionEnabled(true);
      getState().setActionRules([
        {
          id: "ar1",
          type: "set-parameter",
          parameterMapping: { parameterName: "x", sourceField: "y" },
        },
      ]);
      const action = getState().buildClickAction();
      expect(action?.rules).toHaveLength(1);
    });
  });

  describe("clearQueryState", () => {
    it("clears query, availableFields, and transforms", () => {
      getState().setQuery("MATCH (n) RETURN n");
      getState().setAvailableFields(["name", "age"]);
      getState().setTransforms([
        { type: "sort", column: "name", direction: "asc" },
      ]);

      getState().clearQueryState();

      expect(getState().query).toBe("");
      expect(getState().availableFields).toEqual([]);
      expect(getState().transforms).toEqual([]);
    });

    it("does not reset connectionId or chartType", () => {
      getState().setConnectionId("conn-1");
      getState().setChartType("pie");
      getState().setQuery("SELECT * FROM users");

      getState().clearQueryState();

      expect(getState().connectionId).toBe("conn-1");
      expect(getState().chartType).toBe("pie");
    });
  });
});

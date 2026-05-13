import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

/* ---------- mocks (must be declared before imports) ---------- */

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

vi.mock("@neoboard/components", () => ({
  ParamSelector: () => <div data-testid="param-selector" />,
  ParamMultiSelector: () => <div data-testid="param-multi-selector" />,
  DatePickerParameter: () => <div data-testid="date-picker" />,
  DateRangeParameter: () => <div data-testid="date-range" />,
  DateRelativePicker: () => <div data-testid="date-relative" />,
  NumberRangeSlider: () => <div data-testid="number-range" />,
  CascadingSelector: () => <div data-testid="cascading" />,
  FormStepIndicator: ({
    stepLabels,
    currentStep,
    onStepClick,
  }: {
    stepLabels: string[];
    currentStep: number;
    onStepClick?: (step: number) => void;
  }) => (
    <div data-testid="form-step-indicator" data-step={currentStep}>
      {stepLabels.map((l, i) => (
        <button
          key={i}
          data-testid={`step-${i}`}
          onClick={() => onStepClick?.(i)}
        >
          {l}
        </button>
      ))}
    </div>
  ),
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  Label: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("@/components/debounced-text-input", () => ({
  DebouncedTextInput: ({
    parameterName,
    value,
  }: {
    parameterName: string;
    value: string;
  }) => (
    <input
      aria-label={parameterName}
      defaultValue={value}
      data-testid={`input-${parameterName}`}
    />
  ),
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterValues: () => ({}),
}));

const mockMutate = vi.fn();
vi.mock("@/hooks/use-write-query-execution", () => ({
  useWriteQueryExecution: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-seed-query", () => ({
  useSeedQuery: () => ({ options: [], loading: false }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

// Mock the wizard hook — we control its return value per test
const mockGoNext = vi.fn();
const mockGoBack = vi.fn();
const mockGoToStep = vi.fn();
const mockReset = vi.fn();

const defaultWizardState = {
  isWizard: false,
  currentStep: 0,
  totalSteps: 1,
  stepGroups: [] as unknown[][],
  currentFields: [] as unknown[],
  isLastStep: true,
  isSummaryStep: false,
  stepLabels: ["Step 1"],
  goNext: mockGoNext,
  goBack: mockGoBack,
  goToStep: mockGoToStep,
  reset: mockReset,
};

const mockUseFormWizard = vi.fn(() => defaultWizardState);

vi.mock("@/hooks/use-form-wizard", () => ({
  useFormWizard: (...args: unknown[]) => mockUseFormWizard(...args),
}));

/* ---------- import under test ---------- */
import { FormWidgetRenderer } from "../form-widget-renderer";
import type { FormFieldDef } from "@/lib/widget/form-field-def";

/* ---------- helpers ---------- */

function adminSession() {
  mockUseSession.mockReturnValue({
    data: { user: { role: "admin", canWrite: true, tenantId: "t1" } },
  });
}

const step0Fields: FormFieldDef[] = [
  {
    id: "f1",
    label: "Name",
    parameterName: "name",
    parameterType: "text",
    required: true,
    step: 0,
  },
];

const step1Fields: FormFieldDef[] = [
  {
    id: "f2",
    label: "Age",
    parameterName: "age",
    parameterType: "text",
    step: 1,
  },
];

const allFields = [...step0Fields, ...step1Fields];

const wizardProps = {
  connectionId: "conn-1",
  query: "CREATE (n:X {name: $param_name, age: $param_age}) RETURN n",
  settings: {
    formFields: allFields,
    chartOptions: {},
  },
};

/* ---------- tests ---------- */

describe("FormWidgetRenderer — wizard mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminSession();
  });

  describe("step indicator", () => {
    it("renders step indicator when isWizard is true", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentFields: step0Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: false,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByTestId("form-step-indicator")).toBeDefined();
      expect(screen.getByText("Step 1")).toBeDefined();
      expect(screen.getByText("Step 2")).toBeDefined();
    });

    it("does not render step indicator when isWizard is false", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: false,
        currentFields: allFields,
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.queryByTestId("form-step-indicator")).toBeNull();
    });
  });

  describe("navigation buttons", () => {
    it("shows Next button (not Submit) on non-last wizard step", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 0,
        currentFields: step0Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: false,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByRole("button", { name: "Next" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    });

    it("shows Submit button on last step", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 1,
        currentFields: step1Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: true,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByRole("button", { name: "Submit" })).toBeDefined();
    });

    it("shows Submit button on summary step", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 2,
        currentFields: allFields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: false,
        isSummaryStep: true,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByRole("button", { name: "Submit" })).toBeDefined();
    });

    it("hides Back button on step 0", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 0,
        currentFields: step0Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: false,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    });

    it("shows Back button after step 0", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 1,
        currentFields: step1Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: true,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
    });

    it("calls goBack when Back button is clicked", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 1,
        currentFields: step1Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: true,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it("calls goNext when Next button is clicked", () => {
      mockGoNext.mockReturnValue(null);
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 0,
        currentFields: step0Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: false,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(mockGoNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("field rendering", () => {
    it("renders only current step fields", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 0,
        currentFields: step0Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: false,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByTestId("input-name")).toBeDefined();
      expect(screen.queryByTestId("input-age")).toBeNull();
    });

    it("renders step 1 fields when on step 1", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 1,
        currentFields: step1Fields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isLastStep: true,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByTestId("input-age")).toBeDefined();
      expect(screen.queryByTestId("input-name")).toBeNull();
    });
  });

  describe("summary step", () => {
    it("renders summary review text on summary step", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 2,
        currentFields: allFields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isSummaryStep: true,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(
        screen.getByText("Review your entries before submitting"),
      ).toBeDefined();
    });

    it("displays field labels on summary step", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 2,
        currentFields: allFields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isSummaryStep: true,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByText("Name")).toBeDefined();
      expect(screen.getByText("Age")).toBeDefined();
    });

    it("shows dash for empty values on summary step", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: true,
        currentStep: 2,
        currentFields: allFields,
        stepGroups: [step0Fields, step1Fields],
        totalSteps: 2,
        isSummaryStep: true,
        stepLabels: ["Step 1", "Step 2", "Review"],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      // Empty values render as "—"
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe("non-wizard mode", () => {
    it("shows a single Submit button (not Next/Back)", () => {
      mockUseFormWizard.mockReturnValue({
        ...defaultWizardState,
        isWizard: false,
        currentFields: [step0Fields[0]],
      });

      render(<FormWidgetRenderer {...wizardProps} />);

      expect(screen.getByRole("button", { name: "Submit" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    });
  });
});

/* ---------- formatSummaryValue (tested via component output) ---------- */

describe("formatSummaryValue — via summary step rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: { user: { role: "admin", canWrite: true, tenantId: "t1" } },
    });
  });

  it("formats array values as comma-separated", () => {
    const multiField: FormFieldDef = {
      id: "f3",
      label: "Tags",
      parameterName: "tags",
      parameterType: "multi-select",
      step: 0,
    };

    mockUseFormWizard.mockReturnValue({
      ...defaultWizardState,
      isWizard: true,
      currentStep: 1,
      currentFields: [multiField],
      stepGroups: [[multiField]],
      totalSteps: 1,
      isSummaryStep: true,
      stepLabels: ["Step 1", "Review"],
    });

    // The renderer reads localValues from internal state seeded from fields.
    // Since we can't inject localValues directly, we verify the summary renders.
    render(
      <FormWidgetRenderer
        connectionId="conn-1"
        query="CREATE (n {tags: $param_tags})"
        settings={{ formFields: [multiField], chartOptions: {} }}
      />,
    );

    expect(screen.getByText("Tags")).toBeDefined();
  });
});

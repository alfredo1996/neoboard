import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mockUseFeature = vi.fn();

vi.mock("@/hooks/use-features", () => ({
  useFeature: (id: string) => mockUseFeature(id),
}));

const { FeatureGate } = await import("../feature-gate");

describe("FeatureGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when the feature is enabled", () => {
    mockUseFeature.mockReturnValue(true);
    render(
      <FeatureGate feature="sso">
        <div>child content</div>
      </FeatureGate>,
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("renders the fallback when the feature is disabled", () => {
    mockUseFeature.mockReturnValue(false);
    render(
      <FeatureGate feature="sso" fallback={<div>upgrade pls</div>}>
        <div>child content</div>
      </FeatureGate>,
    );
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
    expect(screen.getByText("upgrade pls")).toBeInTheDocument();
  });

  it("renders nothing when disabled with no fallback", () => {
    mockUseFeature.mockReturnValue(false);
    const { container } = render(
      <FeatureGate feature="sso">
        <div>child content</div>
      </FeatureGate>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders fallback during initial load (default hideOnLoading=true)", () => {
    mockUseFeature.mockReturnValue(undefined);
    render(
      <FeatureGate feature="sso" fallback={<div>loading-or-disabled</div>}>
        <div>child content</div>
      </FeatureGate>,
    );
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
    expect(screen.getByText("loading-or-disabled")).toBeInTheDocument();
  });

  it("renders nothing during initial load when hideOnLoading=false", () => {
    mockUseFeature.mockReturnValue(undefined);
    const { container } = render(
      <FeatureGate
        feature="sso"
        fallback={<div>upgrade pls</div>}
        hideOnLoading={false}
      >
        <div>child content</div>
      </FeatureGate>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("passes the feature id to useFeature", () => {
    mockUseFeature.mockReturnValue(true);
    render(
      <FeatureGate feature="custom-roles">
        <div>x</div>
      </FeatureGate>,
    );
    expect(mockUseFeature).toHaveBeenCalledWith("custom-roles");
  });
});

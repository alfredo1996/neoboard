import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FormWritePermissionNote } from "../form-write-permission-note";

describe("FormWritePermissionNote (#1051)", () => {
  it("renders the config-time write-permission warning", () => {
    render(<FormWritePermissionNote />);
    expect(
      screen.getByText(/Form submissions write to the database/i),
    ).toBeInTheDocument();
  });

  it("explains that viewers without write access will see an error", () => {
    render(<FormWritePermissionNote />);
    expect(
      screen.getByText(/without write access will see a submission error/i),
    ).toBeInTheDocument();
  });

  it("is exposed via a stable test id for the editor to target", () => {
    render(<FormWritePermissionNote />);
    expect(
      screen.getByTestId("form-write-permission-note"),
    ).toBeInTheDocument();
  });
});

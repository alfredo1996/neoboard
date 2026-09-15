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

  it("says anyone who can open the dashboard can submit the saved form (#1831)", () => {
    render(<FormWritePermissionNote />);
    expect(
      screen.getByText(/anyone who can open it can submit this form/i),
    ).toBeInTheDocument();
  });

  it("is exposed via a stable test id for the editor to target", () => {
    render(<FormWritePermissionNote />);
    expect(
      screen.getByTestId("form-write-permission-note"),
    ).toBeInTheDocument();
  });
});

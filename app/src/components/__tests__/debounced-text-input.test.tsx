import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

const textInputProps: Array<Record<string, unknown>> = [];
vi.mock("@neoboard/components", () => ({
  TextInputParameter: (p: Record<string, unknown>) => {
    textInputProps.push(p);
    return null;
  },
}));

import { DebouncedTextInput } from "../debounced-text-input";

describe("DebouncedTextInput", () => {
  // #1410: the form names the input from its own label, so the external-label
  // props have to reach the component-library input untouched.
  it("passes the external label and required props through", () => {
    render(
      <DebouncedTextInput
        parameterName="rf1_category"
        value=""
        onChange={vi.fn()}
        id="ctl"
        labelledBy="ext-label"
        required
      />,
    );
    expect(textInputProps.at(-1)).toMatchObject({
      parameterName: "rf1_category",
      id: "ctl",
      labelledBy: "ext-label",
      required: true,
    });
  });
});

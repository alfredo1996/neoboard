import { type ChartOptionDef } from "./shared";

export const formOptions: ChartOptionDef[] = [
  {
    key: "submitButtonText",
    label: "Submit Button Text",
    type: "text",
    default: "Submit",
    category: "Submit button",
    description: "Label for the form submit button.",
  },
  {
    key: "successMessage",
    label: "Success Message",
    type: "text",
    default: "Form submitted successfully",
    category: "After submit",
    description: "Message shown after a successful submission.",
  },
  {
    key: "resetOnSuccess",
    label: "Reset on Success",
    type: "boolean",
    default: true,
    category: "After submit",
    description: "Clear all form fields after a successful submission.",
  },
];

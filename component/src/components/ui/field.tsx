import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "./label";
import { FieldError } from "./field-error";

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

/**
 * What a control inside a `<Field>` gets from it (#2217): its `id` (so the
 * label's `htmlFor` lands), `aria-describedby` (the error, else the help) and
 * `aria-invalid`. Props set on the control itself win; outside a Field the
 * props come back unchanged.
 */
export function useFieldControl<
  P extends {
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  },
>(props: P): P {
  const field = React.useContext(FieldContext);
  if (!field) return props;
  const describedBy =
    [
      ...new Set(
        [props["aria-describedby"], field.describedBy]
          .join(" ")
          .split(/\s+/)
          .filter(Boolean),
      ),
    ].join(" ") || undefined;
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid ? true : undefined),
  };
}

export interface FieldProps {
  /** Visible label, 13px at weight 500, 6px above the control. */
  label: React.ReactNode;
  /** 12px muted text under the control. Replaced by `error` while there is one. */
  help?: React.ReactNode;
  /** 12px red text with an icon: say what to do ("Enter a name."). */
  error?: React.ReactNode;
  /** Adds "(optional)" to the label; required is the default. */
  optional?: boolean;
  /** False when the control is not labelable (a fieldset of buttons): no `for`, name it by `aria-labelledby`. Default true. */
  labelsControl?: boolean;
  /** Stable id for the control and label; generated when omitted. The label's own id is `<id>-label` and the "(optional)" marker's is `<id>-optional`, for a control named by `aria-labelledby`. */
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label, control, then help or error, wired together (#2217). The control
 * (Input, Textarea, SelectTrigger, Combobox, CreatableCombobox, MultiSelect,
 * PasswordInput) reads its id, `aria-describedby` and `aria-invalid` from
 * context; outside a Field it works as before.
 * When to use: every labelled form control.
 * When not to: a checkbox or switch whose label sits beside it, or a
 * control inside a group that has its own legend.
 */
function Field({
  label,
  help,
  error,
  optional,
  labelsControl = true,
  id,
  className,
  children,
}: Readonly<FieldProps>) {
  const generated = React.useId();
  const controlId = id ?? generated;
  const hasError = Boolean(error);
  const helpId = `${controlId}-help`;
  const errorId = `${controlId}-error`;
  let describedBy: string | undefined;
  if (hasError) describedBy = errorId;
  else if (help) describedBy = helpId;
  const value = React.useMemo(
    () => ({ id: controlId, describedBy, invalid: hasError }),
    [controlId, describedBy, hasError],
  );

  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      {/* The label id sits on the plain label and the marker has its own: the
          field's own control lists both ("Score (optional)"), a composed name
          ("Score minimum") lists only the label. */}
      <Label htmlFor={labelsControl ? controlId : undefined}>
        <span id={`${controlId}-label`}>{label}</span>
        {optional && (
          <>
            {" "}
            <span
              id={`${controlId}-optional`}
              className="font-normal text-muted-foreground"
            >
              (optional)
            </span>
          </>
        )}
      </Label>
      <FieldContext.Provider value={value}>{children}</FieldContext.Provider>
      {hasError ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        help && (
          <p id={helpId} className="text-xs text-muted-foreground">
            {help}
          </p>
        )
      )}
    </div>
  );
}

export { Field };

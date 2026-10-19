import * as React from "react";

/**
 * Stand-in for `Field` in the tests that replace `@neoboard/components` with
 * hand-written stubs (#2217). Those stubs ignore React context, so this one
 * hands the id and the aria attributes straight to each child element instead
 * of through the context the real `Field` uses, merging with the child's own
 * props as `useFieldControl` does. A child that drops them fails getByLabelText.
 */
export function FieldStub({
  label,
  help,
  error,
  optional,
  labelsControl = true,
  id,
  className,
  children,
}: Readonly<{
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  labelsControl?: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}>) {
  const fallbackId = React.useId();
  const controlId = id ?? fallbackId;
  let describedBy: string | undefined;
  if (error) describedBy = `${controlId}-error`;
  else if (help) describedBy = `${controlId}-help`;
  return (
    <div className={className}>
      <label htmlFor={labelsControl ? controlId : undefined}>
        <span id={`${controlId}-label`}>{label}</span>
        {optional && (
          <>
            {" "}
            <span id={`${controlId}-optional`}>(optional)</span>
          </>
        )}
      </label>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<Record<string, unknown>>(child)) return child;
        // Same rules as the real `useFieldControl`: the control's own id and
        // aria-invalid win, and its aria-describedby is joined, not replaced.
        const own = child.props["aria-describedby"] as string | undefined;
        return React.cloneElement(child, {
          id: child.props.id ?? controlId,
          "aria-describedby":
            [own, describedBy].filter(Boolean).join(" ") || undefined,
          "aria-invalid":
            child.props["aria-invalid"] ?? (error ? true : undefined),
        });
      })}
      {error ? (
        <p id={`${controlId}-error`} role="alert">
          {error}
        </p>
      ) : (
        help && <p id={`${controlId}-help`}>{help}</p>
      )}
    </div>
  );
}

import * as React from "react";

/**
 * Stand-in for `Field` in the tests that replace `@neoboard/components` with
 * hand-written stubs (#2217). Those stubs ignore React context, so this one
 * hands the id and the aria attributes straight to each child element instead
 * of through the context the real `Field` uses.
 */
export function FieldStub({
  label,
  help,
  error,
  optional,
  id,
  className,
  children,
}: Readonly<{
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
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
      <label htmlFor={controlId}>
        {label}
        {optional && " (optional)"}
      </label>
      {React.Children.map(children, (child) =>
        React.isValidElement<Record<string, unknown>>(child)
          ? React.cloneElement(child, {
              id: child.props.id ?? controlId,
              "aria-describedby": describedBy,
              "aria-invalid": error ? true : undefined,
            })
          : child,
      )}
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

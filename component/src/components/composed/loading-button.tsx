import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type LoadingButtonProps = ButtonProps & {
  loading?: boolean;
  loadingText?: string;
};

const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    { children, loading, loadingText, disabled, className, style, ...props },
    ref,
  ) => {
    const el = React.useRef<HTMLButtonElement | null>(null);
    // The width the button had idle, so swapping the label for a spinner and
    // loadingText does not make it jump.
    const [idleWidth, setIdleWidth] = React.useState(0);
    React.useImperativeHandle(ref, () => el.current as HTMLButtonElement);
    // After every idle commit, so a container that narrows later is measured
    // too; setState with the same value bails out.
    React.useLayoutEffect(() => {
      if (!loading && el.current) setIdleWidth(el.current.offsetWidth);
    });

    return (
      <Button
        {...props}
        ref={el}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={className}
        style={{
          ...style,
          minWidth: loading && idleWidth ? idleWidth : style?.minWidth,
        }}
      >
        {loading && <Spinner size="sm" aria-hidden="true" />}
        {loading && loadingText ? loadingText : children}
      </Button>
    );
  },
);
LoadingButton.displayName = "LoadingButton";

export { LoadingButton };

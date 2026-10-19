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
    React.useLayoutEffect(() => {
      if (!loading && el.current) setIdleWidth(el.current.offsetWidth);
    }, [loading, children]);

    return (
      <Button
        {...props}
        ref={(node) => {
          el.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
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

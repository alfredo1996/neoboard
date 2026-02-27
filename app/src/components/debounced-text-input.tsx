"use client";

import { useEffect, useState } from "react";
import { TextInputParameter } from "@neoboard/components";

/**
 * Thin wrapper around TextInputParameter that debounces the onChange callback
 * by 200 ms so that rapid keystrokes don't flood the parameter store.
 */
export function DebouncedTextInput({
  parameterName,
  value,
  onChange,
  placeholder,
  className,
}: {
  parameterName: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  // Sync draft when the external (store) value changes.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Fire onChange after 200 ms of inactivity.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== value) onChange(draft);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <TextInputParameter
      parameterName={parameterName}
      value={draft}
      onChange={(v) => setDraft(v ?? "")}
      placeholder={placeholder}
      className={className}
    />
  );
}

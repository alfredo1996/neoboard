"use client";

import { useEffect, useRef, useState } from "react";
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
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Sync draft when the external (store) value changes.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Fire onChange after 200 ms of inactivity.
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => {
      onChangeRef.current(draft);
    }, 200);
    return () => clearTimeout(t);
  }, [draft, value]);

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

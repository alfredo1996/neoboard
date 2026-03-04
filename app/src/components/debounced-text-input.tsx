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
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Track the previous value prop to detect external (non-user) changes.
  const prevValueRef = useRef(value);

  // Sync draft when the external (store) value changes (e.g. form reset).
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDraft(value); // eslint-disable-line react-hooks/set-state-in-effect -- intentional sync from prop
  }, [value]);

  // Fire onChange after 200 ms of inactivity.
  useEffect(() => {
    // If the value prop changed externally (e.g. resetOnSuccess), skip
    // creating a debounce timer — the draft/value mismatch is from the
    // external reset, not from user typing.
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      return;
    }
    if (draft === value) return;
    timerRef.current = setTimeout(() => {
      onChangeRef.current(draft);
    }, 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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

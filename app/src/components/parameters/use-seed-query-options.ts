"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType } from "@/stores/parameter-store";
import { useSeedQuery } from "@/hooks/use-seed-query";

export interface SeedQueryResult {
  options: { value: string; label: string; rawValue?: unknown }[];
  loading: boolean;
  setSearchTerm: (term: string) => void;
  parentValue: string | undefined;
}

export function useSeedQueryOptions(
  parameterType: ParameterType,
  connectionId?: string,
  seedQuery?: string,
  parentParameterName?: string,
  searchable = true,
): SeedQueryResult {
  const parameters = useParameterStore((s) => s.parameters);
  const { data: session } = useSession();
  const tenantId = session?.user?.tenantId;

  // Debounced search term
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (!searchable) return;
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchable]);

  // Parent value (for cascading)
  const parentValue = parentParameterName
    ? String(parameters[parentParameterName]?.value ?? "")
    : undefined;

  const parentParams = useMemo(
    () =>
      parentParameterName && parentValue
        ? { [`param_${parentParameterName}`]: parentValue }
        : {},
    [parentParameterName, parentValue],
  );

  // Seed query enablement
  const needsSeed =
    parameterType === "select" ||
    parameterType === "multi-select" ||
    parameterType === "cascading-select";

  const cascadingEnabled =
    parameterType !== "cascading-select" ||
    (parentParameterName !== undefined ? !!parentValue : true);

  const seedExtraParams = useMemo(() => {
    const base = parameterType === "cascading-select" ? parentParams : {};
    if (searchable && debouncedSearch) {
      return { ...base, param_search: debouncedSearch };
    }
    return Object.keys(base).length > 0 ? base : undefined;
  }, [parameterType, parentParams, searchable, debouncedSearch]);

  const { options, loading } = useSeedQuery(
    connectionId,
    seedQuery,
    needsSeed && cascadingEnabled,
    seedExtraParams,
    tenantId,
  );

  return { options, loading, setSearchTerm, parentValue };
}

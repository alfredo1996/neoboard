"use client";

import { useQuery } from "@tanstack/react-query";
import type { ConnectorDescriptor } from "@neoboard/connection";
import { unwrapResponse } from "@/lib/api/api-client";

/**
 * Every installed connector, as data, from `GET /api/connectors` (#1899).
 *
 * This is the browser's only source of connector facts — label, category,
 * icon, query language, fields. The registry pulls in database drivers and
 * cannot be imported here, and nothing in the app spells a connector out.
 *
 * `staleTime: Infinity`: connectors are compiled into the server, so the list
 * cannot change until a deploy, which reloads the page anyway.
 */
export function useConnectors() {
  return useQuery<ConnectorDescriptor[]>({
    queryKey: ["connectors"],
    queryFn: async () =>
      unwrapResponse<ConnectorDescriptor[]>(await fetch("/api/connectors")),
    staleTime: Infinity,
  });
}

/**
 * One connector's descriptor. `undefined` while the list loads — and for a
 * type that is not installed, which a stored connection can outlive.
 */
export function useConnector(
  type: string | null | undefined,
): ConnectorDescriptor | undefined {
  return useConnectors().data?.find((c) => c.type === type);
}

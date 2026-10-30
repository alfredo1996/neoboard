"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DashboardPage } from "@/lib/db/schema";
import {
  buildParameterConsumerMap,
  drivenWidgetIds,
  type ParameterSourceMap,
} from "@/lib/parameter/collect-parameter-names";
import { paramLabel } from "@/lib/parameter/param-label";

interface Lit {
  name: string;
  widgetId: string;
}
type SetLit = (update: (current: Lit | null) => Lit | null) => void;

const SetLitContext = createContext<SetLit>(() => {});
const DrivenContext = createContext<{
  label: string;
  ids: ReadonlySet<string>;
} | null>(null);

/**
 * Holds which filter is pointed at (#2369) and the cards it drives, apart from
 * DashboardContainer: pointing at a filter re-renders only the frames that read
 * it. The cards' bodies are the `children` this component was given, with the
 * same identity as before, so they never re-render and their charts never
 * redraw. View mode only: `editable` lights nothing.
 */
export function FilterLitProvider({
  page,
  editable,
  parameterSourceMap,
  children,
}: Readonly<{
  page: DashboardPage;
  editable: boolean;
  parameterSourceMap?: ParameterSourceMap;
  children: ReactNode;
}>) {
  const [lit, setLit] = useState<Lit | null>(null);
  const consumers = useMemo(() => buildParameterConsumerMap(page), [page]);
  const driven = useMemo(
    () =>
      lit && !editable
        ? {
            label: paramLabel(lit.name, parameterSourceMap),
            ids: drivenWidgetIds(consumers, lit.name, lit.widgetId),
          }
        : null,
    [lit, editable, consumers, parameterSourceMap],
  );
  return (
    <SetLitContext.Provider value={setLit}>
      <DrivenContext.Provider value={driven}>{children}</DrivenContext.Provider>
    </SetLitContext.Provider>
  );
}

/** Reports the pointed-at filter; stable, so a caller never re-renders for it. */
export const useSetLit = () => useContext(SetLitContext);

/** "Uses Actor" while the card is driven by the pointed-at filter, else false. */
export function useDrivenLabel(widgetId: string): string | false {
  const driven = useContext(DrivenContext);
  return driven?.ids.has(widgetId) ? `Uses ${driven.label}` : false;
}

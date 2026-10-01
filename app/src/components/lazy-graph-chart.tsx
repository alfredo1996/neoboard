import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";

// NVL (WebGL, mobx) is heavy and browser-only: loaded lazily, never on the
// server, where a static import evaluated it in every dashboard bundle (#2059).
export const GraphChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.GraphChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

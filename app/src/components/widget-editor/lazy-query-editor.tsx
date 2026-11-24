"use client";

import dynamic from "next/dynamic";

// CodeMirror accesses real DOM APIs — load it only client-side. One lazy
// import, shared by the widget query, the seed query and a form's options query.
export const QueryEditor = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.QueryEditor })),
  { ssr: false },
);

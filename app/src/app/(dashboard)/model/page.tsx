"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Button,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from "@neoboard/components";
import { PageHeader } from "@neoboard/components/kit";
import { useConnections } from "@/hooks/use-connections";
import { canManageConnections } from "@/lib/auth/can-write";
import { ConceptsSection } from "@/components/model/concepts-section";
import { ImportDialog } from "@/components/model/import-dialog";
import { downloadModel } from "@/lib/ontology/download-model";
import { ConnectionTerms } from "@/components/model/connection-terms";

/**
 * The Model page (#2415): each connection's entities, relationships and
 * properties, with the display name, description and hidden flag a creator
 * gives each, and above them the concepts that link connections (#2484).
 * Anyone sees the connections they can use; creators and admins
 * edit.
 */
export default function ModelPage() {
  const { data: session } = useSession();
  const canEdit = canManageConnections(session?.user?.role ?? "creator");
  const { data: connections, isLoading, isError } = useConnections();
  const [search, setSearch] = useState("");
  // The lists follow the search a beat behind the box, so typing stays quick.
  const deferredSearch = useDeferredValue(search);
  // `#connection-<id>`: the Connections page links to a connection's section.
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { toast } = useToast();
  const exportModel = () =>
    downloadModel().catch(() =>
      toast({ title: "Could not export the model", variant: "destructive" }),
    );

  let body;
  if (isLoading) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (isError) {
    body = <p role="alert">Could not load your connections.</p>;
  } else if (!connections?.length) {
    body = (
      <EmptyState
        title="No connections yet"
        description="Add a connection and its entities, relationships and properties appear here."
      />
    );
  } else {
    body = (
      <>
        <ConceptsSection
          connections={connections}
          canEdit={canEdit}
          search={deferredSearch}
          newOpen={newOpen}
          onNewClose={() => setNewOpen(false)}
        />
        {connections.map((c) => (
          <ConnectionTerms
            key={c.id}
            connectionId={c.id}
            name={c.name}
            canEdit={canEdit}
            search={deferredSearch}
            defaultOpen={connections.length === 1}
            forceOpen={hash === `#connection-${c.id}`}
          />
        ))}
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Model"
        meta="What each connection holds, in words people use"
        actions={
          <>
            <Input
              aria-label="Search terms and concepts"
              placeholder="Search terms and concepts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Button variant="secondary" onClick={exportModel}>
              Export
            </Button>
            {canEdit && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                Import
              </Button>
            )}
            {canEdit && !!connections?.length && (
              <Button onClick={() => setNewOpen(true)}>New concept</Button>
            )}
          </>
        }
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-7">{body}</div>
      {canEdit && (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          connections={connections ?? []}
        />
      )}
    </div>
  );
}

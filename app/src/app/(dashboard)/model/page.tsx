"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { EmptyState, Input, Skeleton } from "@neoboard/components";
import { PageHeader } from "@neoboard/components/kit";
import { useConnections } from "@/hooks/use-connections";
import { canManageConnections } from "@/lib/auth/can-write";
import { ConceptsSection } from "@/components/model/concepts-section";
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
          search={search}
        />
        {connections.map((c) => (
          <ConnectionTerms
            key={c.id}
            connectionId={c.id}
            name={c.name}
            canEdit={canEdit}
            search={search}
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
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-7">
        <Input
          aria-label="Search terms and concepts"
          placeholder="Search terms and concepts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {body}
      </div>
    </div>
  );
}

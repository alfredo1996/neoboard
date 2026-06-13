"use client";

import React from "react";
import { Alert, AlertDescription } from "@neoboard/components";
import { Info } from "lucide-react";

/**
 * Config-time note shown in the Form widget editor (#1051).
 *
 * Forms are the only write-capable widget. Submits go through
 * `/api/query/write`, which requires the SUBMITTING user to have write
 * permission and to own the selected connection. There is no
 * connection-level "read-only" flag to detect, so this note is shown
 * unconditionally to warn the author at config time that viewers without
 * write access will hit a 403 — rather than letting them discover the
 * dead end only when an end user submits the form.
 */
export function FormWritePermissionNote() {
  return (
    <Alert
      variant="default"
      className="py-2"
      data-testid="form-write-permission-note"
    >
      <Info className="h-4 w-4" />
      <AlertDescription className="text-xs">
        Form submissions write to the database. Only users with write permission
        who own this connection can submit — readers and viewers without write
        access will see a submission error.
      </AlertDescription>
    </Alert>
  );
}

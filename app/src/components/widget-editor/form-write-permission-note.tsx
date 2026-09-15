"use client";

import React from "react";
import { Alert, AlertDescription } from "@neoboard/components";
import { Info } from "lucide-react";

/**
 * Config-time note shown in the Form widget editor (#1051).
 *
 * Forms are the only write-capable widget. Once the dashboard is saved, anyone
 * who can open it can submit the form, whatever their role or write
 * permission, and each submit runs the query the form saves (#1831). The note
 * tells the author so before the dashboard is shared.
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
        Form submissions write to the database. Once the dashboard is saved,
        anyone who can open it can submit this form, including viewers and
        readers, and each submit runs this query as saved.
      </AlertDescription>
    </Alert>
  );
}

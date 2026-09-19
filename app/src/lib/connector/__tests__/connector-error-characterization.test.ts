import { describe, it, expect } from "vitest";
import { ConnectorError, ConnectorErrorType } from "@neoboard/connection";
import {
  DRIVER_ERROR_FIXTURES,
  driverError,
  type DriverErrorFixture,
} from "./connector-error-fixtures";
import recorded from "./connector-error-characterization.json";
import { classifyConnectionError } from "../connection-error-classifier";
import { isTransientQueryError } from "@/lib/query/transient-error-classifier";
import { describeWriteError } from "@/lib/api/db-error-message";
import { mapPreviewError } from "@/lib/query/preview-error";

/**
 * Characterization of every user-facing outcome a driver error has (#1903).
 *
 * `connector-error-characterization.json` was recorded from the app-side
 * keyword classifiers BEFORE error classification moved into the connectors.
 * It is the contract the move has to keep: the same driver error must still
 * produce the same Test-connection code, the same retry decision, the same
 * form message and the same "this query writes" verdict. Only `outcomeOf`
 * below may change — never the recording.
 */
interface Outcome {
  /** The connection Test result code; `network` / `auth_failed` also mean 502 + the dead-connector memo. */
  code: string;
  /** 408 + Retry-After: the client retries. */
  transient: boolean;
  /** What a form submit is told, or null for the generic 500. */
  write: unknown;
  /** The preview says "this query writes". */
  blockedWrite: boolean;
}

function outcomeOf(fixture: DriverErrorFixture): Outcome {
  const raw = driverError(fixture);
  const wrapped = new ConnectorError(
    raw.message,
    ConnectorErrorType.QUERY,
    raw,
  );
  return {
    code: classifyConnectionError(raw.message),
    transient: isTransientQueryError(raw),
    write: describeWriteError(wrapped) ?? null,
    blockedWrite: mapPreviewError(raw.message) !== null,
  };
}

const labelOf = ({ connector, code, message }: DriverErrorFixture) =>
  [connector, code, message].filter(Boolean).join(" | ");

const outcomes: Record<string, Outcome> = Object.fromEntries(
  DRIVER_ERROR_FIXTURES.map((fixture) => [
    labelOf(fixture),
    outcomeOf(fixture),
  ]),
);

describe("driver error outcomes are what they were before #1903", () => {
  it("covers every fixture, and nothing but the fixtures", () => {
    expect(Object.keys(outcomes).sort()).toEqual(Object.keys(recorded).sort());
  });

  it.each(Object.entries(recorded))("%s", (label, expected) => {
    expect(outcomes[label]).toEqual(expected);
  });
});

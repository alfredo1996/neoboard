import { describe, it, expect } from "vitest";
import { toConnectorError } from "@neoboard/connection";
import {
  DRIVER_ERROR_FIXTURES,
  driverError,
  type DriverErrorFixture,
} from "./connector-error-fixtures";
import recorded from "./connector-error-characterization.json";
import { connectionErrorCode } from "../connection-error-classifier";
import { describeWriteError } from "@/lib/api/db-error-message";

/**
 * Characterization of every user-facing outcome a driver error has (#1903).
 *
 * `connector-error-characterization.json` was recorded from the app-side
 * keyword classifiers BEFORE error classification moved into the connectors
 * (the commit before this one ran it against them). It is the contract the
 * move has to keep: the same driver error must still produce the same
 * Test-connection code, the same retry decision, the same form message and the
 * same "this query writes" verdict. Only `outcomeOf` below changed — never the
 * recording.
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

/**
 * AFTER the move: the driver error goes to the connector that owns it — through
 * the registry, by type — and the app maps the verdict that comes back. The
 * version recorded from read the message itself, with four keyword lists.
 */
function outcomeOf(fixture: DriverErrorFixture): Outcome {
  const raised = toConnectorError(fixture.connector, driverError(fixture));
  return {
    code: connectionErrorCode(raised),
    transient: raised.classification.transient,
    write: describeWriteError(raised) ?? null,
    blockedWrite: raised.classification.blockedWrite === true,
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

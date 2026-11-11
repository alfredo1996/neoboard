/**
 * Setup for every vitest project (node and jsdom).
 *
 * The request limiter is module state shared by every test in a file. A test
 * that leaves a fetch unsettled keeps its slot, and under a shuffled order four
 * of them starve a later test (#2454): start each test with an empty limiter.
 */
import { afterEach } from "vitest";
import { _resetLimitedFetch } from "@/lib/query/limited-fetch";

afterEach(() => _resetLimitedFetch());

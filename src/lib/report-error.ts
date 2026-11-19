import { randomUUID } from "node:crypto";

type ErrorEvent =
  | "http_error"
  | "postgres_pool_error"
  | "session_store_error";

const diagnosticCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "28P01",
  "3D000",
  "42P01",
  "53300",
  "55P03",
  "57014",
  "57P01",
  "P1001",
  "P1002",
  "P2002",
  "P2010",
  "P2024",
  "P2025"
]);

export function reportServerError(
  event: ErrorEvent,
  error: unknown
): string {
  const errorId = randomUUID();

  let code = "UNKNOWN";

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    diagnosticCodes.has(error.code)
  ) {
    code = error.code;
  }

  console.error(JSON.stringify({
    event,
    errorId,
    code
  }));

  return errorId;
}
import type { SessionData }
  from "express-session";

export type AdminSessionIdentity = {
  adminUserId: number;
  adminVersion: string;
};

export function getAdminSessionIdentity(
  session: SessionData
): AdminSessionIdentity | null {
  const adminUserId = session.adminUserId;

  if (
    typeof adminUserId !== "number" ||
    !Number.isSafeInteger(adminUserId) ||
    adminUserId <= 0 ||
    typeof session.adminVersion !== "string"
  ) {
    return null;
  }

  return {
    adminUserId,
    adminVersion: session.adminVersion
  };
}

export function isAdminSessionCurrent(
  sessionVersion: string,
  adminUpdatedAt: Date | null
): boolean {
  return adminUpdatedAt?.toISOString() ===
    sessionVersion;
}

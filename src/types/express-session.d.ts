import "express-session";

declare module "express-session" {
  interface SessionData {
    adminUserId?: number;
    adminVersion?: string;
    csrfToken?: string;
  }
}
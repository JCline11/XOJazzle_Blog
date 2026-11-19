import session from "express-session";
import connectPgSimple from "connect-pg-simple";

import { env } from "./env.ts";
import { pgPool } from "../lib/postgres.ts";

import {
  reportServerError
} from "../lib/report-error.ts";

const PgSessionStore = connectPgSimple(session);

export const SESSION_COOKIE_NAME =
  "xojazzle.sid";

export const sessionStore = new PgSessionStore({
  pool: pgPool,
  createTableIfMissing: false,

  errorLog(...values: unknown[]) {
    const error = values.find(value =>
      value instanceof Error
    );

    reportServerError("session_store_error", error);
  }
});

export const sessionMiddleware = session({
  store: sessionStore,
  secret: env.SESSION_SECRET,
  name: SESSION_COOKIE_NAME,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
});
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { env } from "./env.ts";
import { pgPool } from "../lib/postgres.ts";

const PgSessionStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSessionStore({
    pool: pgPool,
    createTableIfMissing: true
  }),
  secret: env.SESSION_SECRET,
  name: "xojazzle.sid",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
});
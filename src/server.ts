import { createServer } from "node:http";

import app from "./app.ts";

import { env } from "./config/env.ts";
import { sessionStore } from "./config/session.ts";

import { lifecycle } from "./lib/lifecycle.ts";
import { pgPool } from "./lib/postgres.ts";
import prisma from "./lib/prisma.ts";

import {
  closeR2Clients
} from "./services/r2-image-storage.ts";

const server = createServer((req, res) => {
  if (lifecycle.isStopping()) {
    lifecycle.rejectRequest(res);
    return;
  }

  app(req, res);
});

async function closeResources(): Promise<void> {
  const actions: Array<[string, () => unknown]> = [
    ["session store", () => sessionStore.close()],
    ["R2 clients", () => closeR2Clients()],
    ["Prisma client", () => prisma.$disconnect()],
    ["PostgreSQL pool", () => pgPool.end()]
  ];

  let failed = false;

  for (const [name, close] of actions) {
    try {
      await close();
    } catch {
      failed = true;
      console.error(`Failed to close ${name}.`);
    }
  }

  if (failed) {
    throw new Error("Resource cleanup failed.");
  }
}

let stopStarted = false;
let exitStatus = 0;

function stop(reason: string, status = 0): void {
  exitStatus = Math.max(exitStatus, status);

  if (stopStarted) {
    return;
  }

  stopStarted = true;

  console.log(`Shutdown requested: ${reason}.`);

  void lifecycle.shutdown(
    server,
    closeResources,
    {
      timeoutMs: 25_000,

      onTimeout() {
        console.error("Shutdown deadline exceeded.");
        process.exit(1);
      }
    }
  ).then(
    () => {
      console.log("Shutdown complete.");
      process.exitCode = exitStatus;
    },
    () => {
      console.error("Shutdown failed.");
      process.exit(1);
    }
  );
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

server.on("error", () => {
  stop("HTTP server error", 1);
});

server.listen(env.PORT, () => {
  console.log(
    `Server running at http://localhost:${env.PORT}`
  );
});
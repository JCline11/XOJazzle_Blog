import type { RequestHandler } from "express";
import type { Server, ServerResponse } from "node:http";

type ShutdownOptions = {
  timeoutMs: number;
  onTimeout: () => void;
};

export function createLifecycle() {
  const activeHandlers = new Set<Promise<unknown>>();

  let stopping = false;
  let shutdownPromise: Promise<void> | undefined;

  function rejectRequest(res: ServerResponse): void {
    res.writeHead(503, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Connection": "close"
    });

    res.end(JSON.stringify({
      status: "unavailable"
    }));
  }

  function wrap(handler: RequestHandler): RequestHandler {
    return (req, res, next) => {
      if (stopping) {
        rejectRequest(res);
        return;
      }

      const task = Promise.resolve().then(() =>
        handler(req, res, next)
      );

      activeHandlers.add(task);

      void task.then(
        () => {
          activeHandlers.delete(task);
        },
        () => {
          activeHandlers.delete(task);
        }
      );

      // Express 5 forwards a rejected promise to its error handler.
      return task;
    };
  }

  async function waitForHandlers(): Promise<void> {
    while (activeHandlers.size > 0) {
      await Promise.allSettled([...activeHandlers]);
    }
  }

  function shutdown(
    server: Server,
    closeResources: () => Promise<void>,
    options: ShutdownOptions
  ): Promise<void> {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    stopping = true;

    shutdownPromise = (async () => {
      const deadline = setTimeout(() => {
        server.closeAllConnections();
        options.onTimeout();
      }, options.timeoutMs);

      try {
        const httpClosed = new Promise<void>((resolve, reject) => {
          server.close(error => {
            if (
              error &&
              (error as NodeJS.ErrnoException).code !==
                "ERR_SERVER_NOT_RUNNING"
            ) {
              reject(error);
              return;
            }

            resolve();
          });
        });

        await Promise.all([
          httpClosed,
          waitForHandlers()
        ]);

        await closeResources();
      } finally {
        clearTimeout(deadline);
      }
    })();

    return shutdownPromise;
  }

  return {
    isStopping: () => stopping,
    rejectRequest,
    wrap,
    shutdown
  };
}

export const lifecycle = createLifecycle();
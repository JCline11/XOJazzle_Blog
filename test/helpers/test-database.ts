import "dotenv/config";

function parseConnection(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(
      "The database connection setting is invalid."
    );
  }
}

function localIdentity(url: URL): string {
  return [
    url.port || "5432",
    url.pathname
  ].join(":");
}

export function getTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;

  if (!value) {
    throw new Error(
      "Set TEST_DATABASE_URL for the dedicated integration database."
    );
  }

  const test = parseConnection(value);

  const localHosts = new Set([
    "localhost",
    "127.0.0.1",
    "[::1]"
  ]);

  if (
    !["postgres:", "postgresql:"].includes(test.protocol) ||
    !localHosts.has(test.hostname) ||
    test.pathname !== "/xojazzle_test" ||
    test.search !== "" ||
    test.hash !== ""
  ) {
    throw new Error(
      "Integration tests require a local xojazzle_test database without URL query parameters."
    );
  }

  const applicationUrl = process.env.DATABASE_URL;

  if (applicationUrl) {
    const application = parseConnection(applicationUrl);

    if (
      localHosts.has(application.hostname) &&
      localIdentity(application) === localIdentity(test)
    ) {
      throw new Error(
        "TEST_DATABASE_URL must differ from the application database."
      );
    }
  }

  return value;
}
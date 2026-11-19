import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { it } from "node:test";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client } from "../src/lib/r2.ts";

it("aborts stalled R2 requests and allows subsequent requests", { timeout: 10_000 }, async () => {
  let stalled = true;
  const server = createServer((req, res) => {
    req.resume();
    if (!stalled) {
      res.writeHead(200);
      res.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const client = createR2Client({
    R2_ACCOUNT_ID: "0".repeat(32),
    R2_ACCESS_KEY_ID: "test-access",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET_NAME: "test-bucket",
    R2_PUBLIC_BASE_URL: "https://images.example.invalid"
  });
  // Exercise the real SDK transport against a local server, with a shorter deadline.
  client.config.endpoint = async () => ({ protocol: "http:", hostname: "127.0.0.1", port, path: "/" });
  client.config.forcePathStyle = true;
  const handler = client.config.requestHandler as typeof client.config.requestHandler & {
    updateHttpClientConfig: (key: string, value: unknown) => void;
  };
  handler.updateHttpClientConfig("requestTimeout", 100);
  try {
    for (const command of [
      new PutObjectCommand({ Bucket: "test-bucket", Key: "image.webp", Body: new Uint8Array([1]) }),
      new DeleteObjectCommand({ Bucket: "test-bucket", Key: "image.webp" })
    ]) {
      await assert.rejects(client.send(command), { name: "TimeoutError" });
    }
    stalled = false;
    await client.send(new DeleteObjectCommand({ Bucket: "test-bucket", Key: "image.webp" }));
  } finally {
    client.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

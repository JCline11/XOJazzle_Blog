import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  MAX_IMAGE_BYTES
} from "../config/image-upload.ts";

const scenarios = [
  "jpeg",
  "png",
  "heic",
  "homepage-jpeg",
  "homepage-heic"
] as const;

type Scenario = typeof scenarios[number];
type ImageKind = "jpeg" | "png" | "heic";

const scriptPath = fileURLToPath(import.meta.url);

function parseScenario(value: string | undefined): Scenario {
  if (
    !value ||
    !(scenarios as readonly string[]).includes(value)
  ) {
    throw new Error(
      "Choose jpeg, png, heic, homepage-jpeg, or homepage-heic."
    );
  }

  return value as Scenario;
}

function kindFor(scenario: Scenario): ImageKind {
  if (scenario.endsWith("heic")) {
    return "heic";
  }

  return scenario === "png" ? "png" : "jpeg";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function mib(bytes: number): number {
  return round(bytes / (1024 * 1024));
}

function createPixels(length: number): Buffer {
  const pixels = Buffer.allocUnsafe(length);

  let state = 0x12345678;

  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;

    pixels[index] = state >>> 24;
  }

  return pixels;
}

async function prepareInput(kind: ImageKind): Promise<Buffer> {
  if (kind === "heic") {
    return readFile(
      new URL(
        "../../test/fixtures/apple-photo.heic",
        import.meta.url
      )
    );
  }

  // Fixture generation runs only in the parent process.
  const { default: sharp } = await import("sharp");

  sharp.cache(false);

  if (kind === "png") {
    return sharp(
      createPixels(256 * 256 * 3),
      {
        raw: {
          width: 256,
          height: 256,
          channels: 3
        }
      }
    )
      .resize(5000, 5000, { kernel: "nearest" })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  const pixels = createPixels(6000 * 4000 * 3);

  for (const quality of [35, 25, 15, 5]) {
    const encoded = await sharp(pixels, {
      raw: {
        width: 6000,
        height: 4000,
        channels: 3
      }
    })
      .jpeg({ quality })
      .toBuffer();

    if (encoded.byteLength <= MAX_IMAGE_BYTES) {
      return encoded;
    }
  }

  throw new Error(
    "The synthetic JPEG exceeds the current upload limit."
  );
}

async function readInput(): Promise<Buffer> {
  const chunks: Buffer[] = [];

  let length = 0;

  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    length += buffer.byteLength;

    if (length > MAX_IMAGE_BYTES) {
      throw new Error(
        "The profiling input exceeds the upload limit."
      );
    }

    chunks.push(buffer);
  }

  if (length === 0) {
    throw new Error("The profiling input is empty.");
  }

  return Buffer.concat(chunks, length);
}

async function measure(scenario: Scenario): Promise<void> {
  const { processUploadedImage } =
    await import("../services/image-processing.ts");

  const idleRss = process.memoryUsage.rss();
  const input = await readInput();

  const homepage = scenario.startsWith("homepage-");
  const inputCount = homepage ? 10 : 1;
  const processedCount = homepage ? 5 : 1;

  const inputs = [input];

  for (let index = 1; index < inputCount; index += 1) {
    inputs.push(Buffer.from(input));
  }

  const stagedRss = process.memoryUsage.rss();

  const kind = kindFor(scenario);
  const mimetype =
    kind === "jpeg" ? "image/jpeg" : "image/" + kind;

  const outputs: Uint8Array[] = [];
  const perImageMs: number[] = [];

  const started = performance.now();

  for (let index = 0; index < processedCount; index += 1) {
    const imageStarted = performance.now();

    const result = await processUploadedImage({
      buffer: inputs[index],
      mimetype
    });

    outputs.push(result.bytes);

    perImageMs.push(
      round(performance.now() - imageStarted)
    );
  }

  const elapsedMs = round(performance.now() - started);

  // Keep the input and output buffers referenced through measurement.
  const retainedInputBytes = inputs.reduce(
    (total, buffer) => total + buffer.byteLength,
    0
  );

  const retainedOutputBytes = outputs.reduce(
    (total, buffer) => total + buffer.byteLength,
    0
  );

  const peakRssBytes = process.resourceUsage().maxRSS * 1024;

  console.log(JSON.stringify({
    scenario,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    retainedInputs: inputs.length,
    processedImages: outputs.length,
    inputFileMiB: mib(input.byteLength),
    retainedInputMiB: mib(retainedInputBytes),
    retainedOutputMiB: mib(retainedOutputBytes),
    idleRssMiB: mib(idleRss),
    stagedRssMiB: mib(stagedRss),
    peakRssMiB: mib(peakRssBytes),
    endRssMiB: mib(process.memoryUsage.rss()),
    elapsedMs,
    perImageMs
  }));
}

async function measureInChild(
  scenario: Scenario,
  input: Buffer
): Promise<void> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [scriptPath, "--measure", scenario],
      {
        env: {
          ...process.env,
          NODE_OPTIONS: ""
        },
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";

    const deadline = setTimeout(() => {
      child.kill("SIGKILL");

      reject(
        new Error(
          "The profiling process timed out for " + scenario + "."
        )
      );
    }, 180_000);

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", chunk => {
      stderr = (stderr + chunk.toString()).slice(-4096);
    });

    child.once("error", error => {
      clearTimeout(deadline);
      reject(error);
    });

    child.once("close", code => {
      clearTimeout(deadline);

      if (code !== 0) {
        reject(
          new Error(
            "Measurement failed for " + scenario +
            " (exit " + code + "). " + stderr.trim()
          )
        );
        return;
      }

      resolve(stdout);
    });

    // A failed child can close its input pipe early.
    // Its exit status and stderr provide the failure report.
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });

  console.log(JSON.stringify(JSON.parse(output)));
}

async function main(): Promise<void> {
  if (process.argv[2] === "--measure") {
    await measure(parseScenario(process.argv[3]));
    return;
  }

  const selected: readonly Scenario[] =
    process.argv[2] === undefined
      ? scenarios
      : [parseScenario(process.argv[2])];

  const inputs = new Map<ImageKind, Buffer>();

  for (const scenario of selected) {
    const kind = kindFor(scenario);

    let input = inputs.get(kind);

    if (!input) {
      input = await prepareInput(kind);

      if (
        input.byteLength === 0 ||
        input.byteLength > MAX_IMAGE_BYTES
      ) {
        throw new Error(
          "The profiling fixture violates the upload size limit."
        );
      }

      inputs.set(kind, input);
    }

    await measureInChild(scenario, input);
  }
}

void main().catch(error => {
  console.error(
    error instanceof Error
      ? error.message
      : "Image resource profiling failed."
  );

  process.exitCode = 1;
});
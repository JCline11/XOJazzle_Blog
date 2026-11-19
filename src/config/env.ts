import "dotenv/config";

import {
  loadAppEnv
} from "./app-env.ts";

export const env = loadAppEnv(process.env);
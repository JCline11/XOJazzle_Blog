import { defineConfig } from "prisma/config";

import {
  getTestDatabaseUrl
} from "./helpers/test-database.ts";

export default defineConfig({
  schema: "../prisma/schema.prisma",

  migrations: {
    path: "../prisma/migrations"
  },

  datasource: {
    url: getTestDatabaseUrl()
  }
});
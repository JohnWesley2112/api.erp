
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/admin/schema.prisma",
  migrations: {
    path: "prisma/admin/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("ADMIN_DATABASE_URL"),
  },
});

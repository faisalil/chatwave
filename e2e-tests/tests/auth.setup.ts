import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { expectAuthenticatedShell, signIn } from "./helpers/chatwave";

const authStoragePath = path.join(__dirname, ".auth", "seed-user.json");
const seedEmail = process.env.E2E_SEED_EMAIL ?? "seed.owner.a@chatwave.test";
const seedPassword = process.env.E2E_SEED_PASSWORD ?? "testtest123";

setup("authenticate seed user", async ({ page }) => {
  await page.goto("/");
  await signIn(page, seedEmail, seedPassword);
  await expectAuthenticatedShell(page);
  await mkdir(path.dirname(authStoragePath), { recursive: true });
  await page.context().storageState({ path: authStoragePath });
});

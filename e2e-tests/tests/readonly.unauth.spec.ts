import { expect, test } from "@playwright/test";
import {
  expectAuthenticatedShell,
  expectLoginErrorToast,
  expectUnauthenticatedLanding,
  signIn,
} from "./helpers/chatwave";

const seedEmail = process.env.E2E_SEED_EMAIL ?? "seed.owner.a@chatwave.test";
const seedPassword = process.env.E2E_SEED_PASSWORD ?? "testtest123";

test.describe("Readonly unauthenticated flows", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders unauthenticated landing", async ({ page }) => {
    await page.goto("/");
    await expectUnauthenticatedLanding(page);
  });

  test("shows login error for invalid password and remains signed out", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, seedEmail, "wrong-password");
    await expectLoginErrorToast(page);
    await expectUnauthenticatedLanding(page);
    await expect(page.getByRole("button", { name: "Search Messages" })).toHaveCount(0);
  });

  test("signs in successfully with seed credentials", async ({ page }) => {
    await page.goto("/");
    await signIn(page, seedEmail, seedPassword);
    await expectAuthenticatedShell(page);
  });
});

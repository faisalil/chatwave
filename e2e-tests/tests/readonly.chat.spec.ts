import { expect, test } from "@playwright/test";
import {
  closeSearchModal,
  expectAuthenticatedShell,
  expectUnauthenticatedLanding,
  openSearchModal,
  waitForChannelLoaded,
} from "./helpers/chatwave";

test.describe("Readonly authenticated chat flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expectAuthenticatedShell(page);
  });

  test("loads channel list and auto-selects first channel", async ({ page }) => {
    await expect(page.getByRole("button", { name: "# general" })).toBeVisible();
    await expect(page.getByRole("button", { name: "# product" })).toBeVisible();
    await expect(page.getByRole("button", { name: "# random" })).toBeVisible();
    await waitForChannelLoaded(page, "general");
  });

  test("switches to #product channel", async ({ page }) => {
    await page.getByRole("button", { name: "# product" }).click();
    await waitForChannelLoaded(page, "product");
  });

  test("renders seeded messages with author names and timestamps", async ({ page }) => {
    await waitForChannelLoaded(page, "general");
    await expect(page.getByText("Seed Owner A").first()).toBeVisible();
    await expect(page.getByText("Seed Member A").first()).toBeVisible();
    await expect(page.getByText("Welcome to Seed Workspace A.")).toBeVisible();
    await expect(page.getByText("Use #general for focused updates.")).toBeVisible();
    await expect
      .poll(async () => {
        const bodyText = await page.locator("body").innerText();
        return /\b\d{1,2}:\d{2}:\d{2}\s?(AM|PM)\b/.test(bodyText);
      })
      .toBe(true);
  });

  test("opens search modal, shows empty state, and closes", async ({ page }) => {
    await openSearchModal(page);
    await expect(page.getByText("Enter a search term to find messages")).toBeVisible();
    await closeSearchModal(page);
  });

  test("shows no-results state for nonsense query", async ({ page }) => {
    await openSearchModal(page);
    const query = "zzzz-not-found-term";
    await page.getByPlaceholder("Search for messages...").fill(query);
    await expect(page.getByText(`No messages found for "${query}"`)).toBeVisible();
    await closeSearchModal(page);
  });

  test("returns results for known search query", async ({ page }) => {
    await openSearchModal(page);
    await page.getByPlaceholder("Search for messages...").fill("focused updates");
    await expect(page.getByText("in #general")).toBeVisible();
    await expect(page.getByText("in #product")).toBeVisible();
    await expect(page.getByText("in #random")).toBeVisible();
    await closeSearchModal(page);
  });

  test("navigates to matching channel from search result click", async ({ page }) => {
    await page.getByRole("button", { name: "# product" }).click();
    await waitForChannelLoaded(page, "product");

    await openSearchModal(page);
    await page.getByPlaceholder("Search for messages...").fill("focused updates");
    await page.getByText("in #general").first().click();
    await expect(page.getByRole("heading", { name: "Search Messages" })).toHaveCount(0);
    await waitForChannelLoaded(page, "general");
  });

  test("opens profile modal, keeps email readonly, and closes via cancel", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Edit Profile" }).click();
    await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toBeDisabled();
    await expect(emailInput).toHaveValue(/@chatwave\.test$/);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Edit Profile" })).toHaveCount(0);
  });

  test("signs out and returns to unauthenticated landing", async ({ page }) => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expectUnauthenticatedLanding(page);
  });
});

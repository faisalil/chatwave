import { expect, type Page } from "@playwright/test";

const LOGIN_ERROR_MESSAGES = [
  "Invalid password. Please try again.",
  "Could not sign in, did you mean to sign up?",
];

export async function expectUnauthenticatedLanding(page: Page) {
  await expect(page.getByRole("heading", { name: "Welcome to ChatWave" })).toBeVisible();
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign up instead" })).toBeVisible();
}

export async function signIn(page: Page, email: string, password: string) {
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function expectAuthenticatedShell(page: Page) {
  await expect(page.getByRole("button", { name: "Search Messages" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Channels" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

export async function waitForChannelLoaded(page: Page, channelName: string) {
  await expect(
    page.getByRole("heading", { name: `# ${channelName}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByPlaceholder(`Message #${channelName}`)).toBeVisible();
}

export async function openSearchModal(page: Page) {
  await page.getByRole("button", { name: "Search Messages" }).click();
  await expect(page.getByRole("heading", { name: "Search Messages" })).toBeVisible();
  await expect(page.getByPlaceholder("Search for messages...")).toBeVisible();
}

export async function closeSearchModal(page: Page) {
  await page.getByRole("button", { name: "×" }).click();
  await expect(page.getByRole("heading", { name: "Search Messages" })).toHaveCount(0);
}

export async function expectLoginErrorToast(page: Page) {
  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText();
      return LOGIN_ERROR_MESSAGES.some((message) => bodyText.includes(message));
    })
    .toBe(true);
}

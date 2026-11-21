import { expect, test } from "playthrough/test";

test.use({ person: "Rosa" });

test("Alder Dental's invoice is marked paid", async ({ page, setup, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await test.inView(page.getByRole("button", { name: "Mark paid", exact: true }).nth(0), { offScreen: true });
  await test.step("Alder Dental's invoice is marked paid", async () => {
    await page.getByRole("button", { name: "Mark paid", exact: true }).nth(0).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
  });
});

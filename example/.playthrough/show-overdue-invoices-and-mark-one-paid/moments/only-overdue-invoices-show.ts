import { expect, test } from "playthrough/test";

test.use({ person: "Rosa" });

test("Only overdue invoices show", async ({ page, setup, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await test.inView(page.getByRole("button", { name: "Overdue", exact: true }), { offScreen: true });
  await test.step("Only overdue invoices show", async () => {
    await page.getByRole("button", { name: "Overdue", exact: true }).click();
  });
});

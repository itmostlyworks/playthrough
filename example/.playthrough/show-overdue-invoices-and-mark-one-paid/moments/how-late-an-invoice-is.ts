import { expect, test } from "playthrough/test";

test.use({ person: "Rosa" });

test("How late an invoice is", async ({ page, setup, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await page.getByRole("button", { name: "Overdue", exact: true }).click();
  await test.inView(page.getByRole("cell", { name: "Overdue 69 days late", exact: true }), { offScreen: true });
  await test.step("How late an invoice is", async () => {
    await page.getByRole("cell", { name: "Overdue 69 days late", exact: true }).hover();
  });
});

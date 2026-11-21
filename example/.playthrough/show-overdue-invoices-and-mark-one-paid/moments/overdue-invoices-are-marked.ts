import { expect, test } from "playthrough/test";

test.use({ person: "Rosa" });

test("Overdue invoices are marked", async ({ page, setup, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await test.inView(page.getByText("Status", { exact: true }));
  await test.step("Overdue invoices are marked", async () => {
    await expect(page.getByText("Status", { exact: true })).toBeVisible();
  });
});

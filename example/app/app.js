// A small invoices page for trying Vantage on: a table, and buttons that show some of it.

const invoices = [
  { number: "INV-1041", customer: "Harbor & Finch", due: "2026-07-14", amount: 1840, status: "paid" },
  { number: "INV-1042", customer: "Northwind Studio", due: "2026-07-30", amount: 3650, status: "paid" },
  { number: "INV-1043", customer: "Alder Dental", due: "2026-08-12", amount: 920, status: "overdue" },
  { number: "INV-1044", customer: "Kestrel Logistics", due: "2026-08-29", amount: 5100, status: "paid" },
  { number: "INV-1045", customer: "Harbor & Finch", due: "2026-09-15", amount: 1840, status: "overdue" },
  { number: "INV-1046", customer: "Juniper Books", due: "2026-10-03", amount: 460, status: "open" },
  { number: "INV-1047", customer: "Northwind Studio", due: "2026-10-28", amount: 2975, status: "open" },
  { number: "INV-1048", customer: "Alder Dental", due: "2026-11-09", amount: 920, status: "open" },
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const labels = { open: "Open", overdue: "Overdue", paid: "Paid" };

function show(status) {
  for (const button of document.querySelectorAll(".filters button")) button.setAttribute("aria-pressed", String(button.dataset.status === status));
  document.querySelector("tbody").replaceChildren(
    ...invoices
      .filter((invoice) => status === "all" || invoice.status === status)
      .map((invoice) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${invoice.number}</td><td>${invoice.customer}</td><td>${day.format(new Date(invoice.due))}</td>
          <td class="amount">${money.format(invoice.amount)}</td><td><span class="status ${invoice.status}">${labels[invoice.status]}</span></td>`;
        return row;
      }),
  );
}

for (const button of document.querySelectorAll(".filters button")) button.addEventListener("click", () => show(button.dataset.status));
show("all");

// A small invoices page for trying Playthrough on: a table, and buttons that show some of it.
// What it holds is kept in the tab's sessionStorage, so what's done in it survives a reload; a new tab starts from the
// same invoices, on the same day, so the page looks the same whenever it's opened.

const start = {
  today: "2026-10-20",
  invoices: [
    { number: "INV-1041", customer: "Harbor & Finch", due: "2026-07-14", amount: 1840, paid: true },
    { number: "INV-1042", customer: "Northwind Studio", due: "2026-07-30", amount: 3650, paid: true },
    { number: "INV-1043", customer: "Alder Dental", due: "2026-08-12", amount: 920, paid: false },
    { number: "INV-1044", customer: "Kestrel Logistics", due: "2026-08-29", amount: 5100, paid: true },
    { number: "INV-1045", customer: "Harbor & Finch", due: "2026-09-15", amount: 1840, paid: false },
    { number: "INV-1046", customer: "Juniper Books", due: "2026-10-03", amount: 460, paid: false },
    { number: "INV-1047", customer: "Northwind Studio", due: "2026-10-28", amount: 2975, paid: false },
    { number: "INV-1048", customer: "Alder Dental", due: "2026-11-09", amount: 920, paid: false },
  ],
};

const held = (() => {
  try {
    return JSON.parse(sessionStorage.getItem("invoices") ?? "null") ?? start;
  } catch {
    return start;
  }
})();
const keep = () => {
  try {
    sessionStorage.setItem("invoices", JSON.stringify(held));
  } catch {}
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const labels = { open: "Open", overdue: "Overdue", paid: "Paid" };
const DAY = 24 * 60 * 60 * 1000;
const late = (invoice) => Math.round((new Date(held.today) - new Date(invoice.due)) / DAY);
const statusOf = (invoice) => (invoice.paid ? "paid" : late(invoice) > 0 ? "overdue" : "open");
// Overdue first, as they're the ones to chase; otherwise by when they're due.
const order = (a, b) => (statusOf(b) === "overdue") - (statusOf(a) === "overdue") || a.due.localeCompare(b.due);
let showing = "all";

function show(status) {
  showing = status;
  for (const button of document.querySelectorAll(".filters button")) button.setAttribute("aria-pressed", String(button.dataset.status === status));
  document.querySelector("tbody").replaceChildren(
    ...[...held.invoices]
      .sort(order)
      .filter((invoice) => status === "all" || statusOf(invoice) === status)
      .map((invoice) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${invoice.number}</td><td>${invoice.customer}</td><td>${day.format(new Date(invoice.due))}</td>
          <td class="amount">${money.format(invoice.amount)}</td><td><span class="status ${statusOf(invoice)}">${labels[statusOf(invoice)]}</span></td><td class="act"></td>`;
        if (statusOf(invoice) === "overdue") {
          const tip = document.createElement("span");
          tip.className = "tip";
          tip.textContent = `${late(invoice)} days late`;
          row.querySelector(".status").append(tip);
        }
        if (!invoice.paid) {
          const pay = document.createElement("button");
          pay.className = "pay";
          pay.textContent = "Mark paid";
          pay.addEventListener("click", () => {
            invoice.paid = true;
            keep();
            show(showing);
            say(`${invoice.number} is marked paid.`, () => {
              invoice.paid = false;
              keep();
              show(showing);
            });
          });
          row.querySelector(".act").append(pay);
        }
        return row;
      }),
  );
}

// What was just done, with a way to take it back, until something else is done.
const toast = document.querySelector(".toast");
function say(words, undo) {
  toast.querySelector("span").textContent = words;
  toast.querySelector("button").onclick = () => {
    undo();
    toast.hidden = true;
  };
  toast.hidden = false;
}

for (const button of document.querySelectorAll(".filters button"))
  button.addEventListener("click", () => {
    toast.hidden = true;
    show(button.dataset.status);
  });
show("all");

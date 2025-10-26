import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

document.getElementById("year").textContent = new Date().getFullYear();

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const params = new URLSearchParams(location.search);
const oid = params.get("oid");
document.getElementById("order-id").textContent = oid || "Unknown";

const fmt = (n)=> `$${Number(n||0).toFixed(2)}`;

async function load() {
  if (!oid) return;

  try {
    const snap = await getDoc(doc(db, "orders", oid));
    if (!snap.exists()) {
      document.getElementById("cust-name").textContent = "—";
      document.getElementById("cust-email").textContent = "—";
      document.getElementById("cust-notes").textContent = "—";
      document.getElementById("lines").innerHTML =
        `<tr><td colspan="4" class="muted">Receipt details unavailable. Please check your email for confirmation.</td></tr>`;
      return;
    }
    const o = snap.data();

    document.getElementById("cust-name").textContent = o.customer?.name || "—";
    document.getElementById("cust-email").textContent = o.customer?.email || "—";
    document.getElementById("cust-notes").textContent = o.customer?.notes || "—";

    const tbody = document.getElementById("lines");
    tbody.innerHTML = "";
    (o.items || []).forEach(it=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${it.name}</td>
                      <td>${it.qty}</td>
                      <td>${fmt(it.price)}</td>
                      <td>${fmt(it.subtotal)}</td>`;
      tbody.appendChild(tr);
    });

    document.getElementById("grand").textContent = fmt(o.total);
  } catch (e) {
    console.error(e);
  }
}
load();

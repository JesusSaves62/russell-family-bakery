// admin.js (Admin Panel)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.getElementById("year").textContent = new Date().getFullYear();

// UI refs
const emailEl = document.getElementById("admin-email");
const passEl = document.getElementById("admin-password");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const authMsg = document.getElementById("auth-msg");
const whoami = document.getElementById("whoami");
const manager = document.getElementById("manager");
const authSection = document.getElementById("auth-section");
const signoutSection = document.getElementById("signout-section");

// form & tables
const form = document.getElementById("item-form");
const itemIdEl = document.getElementById("item-id");
const nameEl = document.getElementById("item-name");
const priceEl = document.getElementById("item-price");
const descEl = document.getElementById("item-desc");
const resetBtn = document.getElementById("reset-form");
const tableBody = document.getElementById("items-table");
const ordersBody = document.getElementById("orders-table");

// Auth
loginBtn.addEventListener("click", async ()=>{
  authMsg.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, emailEl.value, passEl.value);
  } catch (e) {
    authMsg.textContent = e.message;
  }
});
logoutBtn.addEventListener("click", ()=> signOut(auth));

onAuthStateChanged(auth, (user)=>{
  if(user){
    whoami.textContent = user.email || user.uid;
    authSection.classList.add("hidden");
    signoutSection.classList.remove("hidden");
    manager.classList.remove("hidden");
    bindMenu(); bindOrders();
  } else {
    whoami.textContent = "";
    signoutSection.classList.add("hidden");
    manager.classList.add("hidden");
    authSection.classList.remove("hidden");
    tableBody.innerHTML = "";
    ordersBody.innerHTML = "";
  }
});

// Bind menu table
function bindMenu(){
  const q = query(collection(db, "menu"), orderBy("name"));
  onSnapshot(q, (snap)=>{
    tableBody.innerHTML = "";
    snap.forEach(d=>{
      const data = d.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${data.name}</td>
        <td>$${Number(data.price).toFixed(2)}</td>
        <td>${data.desc || ""}</td>
        <td>
          <button data-edit="${d.id}" class="secondary">Edit</button>
          <button data-del="${d.id}" style="margin-left:6px;">Delete</button>
        </td>
      `;
      tr.querySelector("[data-edit]").addEventListener("click", ()=>{
        itemIdEl.value = d.id;
        nameEl.value = data.name;
        priceEl.value = data.price;
        descEl.value = data.desc || "";
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      tr.querySelector("[data-del]").addEventListener("click", async ()=>{
        if(confirm(`Delete "${data.name}"?`)){
          await deleteDoc(doc(db, "menu", d.id));
        }
      });
      tableBody.appendChild(tr);
    });
  });
}

// Bind orders table
function bindOrders(){
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap)=>{
    ordersBody.innerHTML = "";
    snap.forEach(d=>{
      const o = d.data();
      const when = o.createdAt?.toDate ? o.createdAt.toDate() : null;
      const whenStr = when ? when.toLocaleString() : "—";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${whenStr}</td>
        <td>${o.customer?.name || "—"}</td>
        <td>${o.customer?.email || "—"}</td>
        <td>$${Number(o.total||0).toFixed(2)}</td>
        <td><a href="receipt.html?oid=${d.id}" target="_blank">View</a></td>
      `;
      ordersBody.appendChild(tr);
    });
  });
}

// Save item
form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const payload = {
    name: nameEl.value.trim(),
    price: Number(priceEl.value),
    desc: descEl.value.trim()
  };
  if(!payload.name || isNaN(payload.price)) return;
  try {
    if(itemIdEl.value){
      await updateDoc(doc(db, "menu", itemIdEl.value), payload);
    } else {
      await addDoc(collection(db, "menu"), payload);
    }
    form.reset(); itemIdEl.value = "";
    alert("Saved!");
  } catch (e) {
    alert("Error saving item: " + e.message);
  }
});
resetBtn.addEventListener("click", ()=> { form.reset(); itemIdEl.value=""; });

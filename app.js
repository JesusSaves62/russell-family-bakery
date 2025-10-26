// --- APP.JS with automatic "sample menu" fallback ---
// If Firestore isn't configured yet, we render the sample items below.

const YEAR_EL = document.getElementById("year");
if (YEAR_EL) YEAR_EL.textContent = new Date().getFullYear();

const menuList = document.getElementById("menu-list");
const cartItemsEl = document.getElementById("cart-items");
const totalEl = document.getElementById("cart-total");
const clearBtn = document.getElementById("clear-cart");
const nameEl = document.getElementById("cust-name");
const emailEl = document.getElementById("cust-email");
const notesEl = document.getElementById("cust-notes");

// 1) Sample items for preview mode
const SEED_MENU = [
  { id: "seed-tamales", name: "12 Tamales", price: 25.00, desc: "A dozen hand-wrapped tamales." },
  { id: "seed-cookies", name: "Gourmet Chocolate Chip Cookies", price: 4.00, desc: "Rich, gooey, scratch-made." }
];

function renderMenu(items){
  menuList.innerHTML = "";
  items.forEach(d=>{
    const card = document.createElement("div");
    card.className = "menu-item";
    card.innerHTML = `
      <h3>${d.name}</h3>
      ${d.desc ? `<p class="muted">${d.desc}</p>` : ""}
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>$${d.price.toFixed(2)}</strong>
        <button>Add to cart</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", ()=> addToCart(d));
    menuList.appendChild(card);
  });
}

// 2) Cart (works in both preview & Firebase modes)
let cart = JSON.parse(localStorage.getItem("cart") || "[]");
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function addToCart(item){
  const existing = cart.find(c => c.id === item.id);
  if(existing){ existing.qty += 1; } else { cart.push({ id:item.id, name:item.name, price:item.price, qty:1 }); }
  saveCart();
}
function removeFromCart(id){ cart = cart.filter(c => c.id !== id); saveCart(); }
function updateQty(id, qty){ const c=cart.find(x=>x.id===id); if(!c) return; c.qty=Math.max(1, qty|0); saveCart(); }
function cartTotal(){ return cart.reduce((s,i)=> s + i.price*i.qty, 0); }
function renderCart(){
  cartItemsEl.innerHTML = cart.length ? "" : "<p class='muted'>Your cart is empty.</p>";
  cart.forEach(item=>{
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div>
          <strong>${item.name}</strong><br/>
          <small>$${item.price.toFixed(2)} each</small>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="number" min="1" value="${item.qty}" style="width:72px" />
          <button class="secondary remove">Remove</button>
        </div>
      </div>
    `;
    row.querySelector("input").addEventListener("change", e=> updateQty(item.id, +e.target.value));
    row.querySelector(".remove").addEventListener("click", ()=> removeFromCart(item.id));
    cartItemsEl.appendChild(row);
  });
  totalEl.textContent = `$${cartTotal().toFixed(2)}`;
}
renderCart();
if (clearBtn) clearBtn.addEventListener("click", ()=>{ cart=[]; saveCart(); });

// 3) Try to load from Firestore; fall back to sample items on error/empty
(async function initMenu(){
  let usedFirebase = false;
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js");
    const { getFirestore, collection, onSnapshot, query, orderBy } =
      await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js");
    const { firebaseConfig } = await import("./firebase-config.js");

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const q = query(collection(db, "menu"), orderBy("name"));
    onSnapshot(q, (snap)=>{
      usedFirebase = true;
      if (snap.empty) {
        renderMenu(SEED_MENU); // Firestore connected but no items yet
      } else {
        const list = snap.docs.map(doc=> ({ id: doc.id, ...doc.data() }));
        renderMenu(list);
      }
    }, (err)=> {
      console.error("Firestore error:", err);
      renderMenu(SEED_MENU);
    });

    // If Firestore never responds within 2s, show seed items
    setTimeout(()=>{ if (!usedFirebase) renderMenu(SEED_MENU); }, 2000);
  } catch (e) {
    console.log("Firebase not configured yet; showing sample items.", e);
    renderMenu(SEED_MENU);
  }
})();

// 4) PayPal (client-side only)
function paypalItems(){
  return cart.map(i=> ({
    name: i.name,
    unit_amount: { currency_code: "USD", value: i.price.toFixed(2) },
    quantity: i.qty.toString()
  }));
}
function orderTotal(){ return cartTotal().toFixed(2); }
function validCustomer(){ return nameEl.value.trim() && /\S+@\S+\.\S+/.test(emailEl.value.trim()); }

if (window.paypal) {
  window.paypal.Buttons({
    style: { shape: 'rect', label: 'checkout' },
    onInit: (data, actions) => {
      actions.disable();
      const check = () => { (cart.length && validCustomer()) ? actions.enable() : actions.disable(); };
      ["input","change"].forEach(evt=>{
        nameEl.addEventListener(evt, check); emailEl.addEventListener(evt, check);
      });
      const obs = new MutationObserver(check);
      obs.observe(cartItemsEl, { childList:true, subtree:true });
      check();
    },
    createOrder: (data, actions) => {
      return actions.order.create({
        purchase_units: [{
          description: `Family Treats order for ${nameEl.value}`,
          amount: {
            currency_code: "USD",
            value: orderTotal(),
            breakdown: { item_total: { currency_code: "USD", value: orderTotal() } }
          },
          items: paypalItems(),
          custom_id: `notes: ${notesEl.value || ''}`
        }],
        payer: { email_address: emailEl.value, name: { given_name: nameEl.value } },
        application_context: { shipping_preference: "NO_SHIPPING" }
      });
    },
    onApprove: async (data, actions) => {
      const details = await actions.order.capture();
      const lineItems = cart.map(i => ({
        id: i.id, name: i.name, price: Number(i.price), qty: i.qty,
        subtotal: Number((i.price * i.qty).toFixed(2))
      }));
      const total = Number(cartTotal().toFixed(2));
      const lastOrder = {
        status: "paid",
        paypalOrderId: details.id,
        customer: { name: nameEl.value.trim(), email: emailEl.value.trim(), notes: (notesEl.value || "").trim() },
        items: lineItems, total, createdAt: new Date().toISOString()
      };
      localStorage.setItem("lastOrder", JSON.stringify(lastOrder));
      cart = []; saveCart();
      window.location.href = `receipt.html`;
    },
    onError: (err) => { console.error(err); alert("Payment error. Please try again."); }
  }).render("#paypal-button-container");
}

// app.js (Storefront)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, query, orderBy,
  addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM
const menuList = document.getElementById("menu-list");
const cartItemsEl = document.getElementById("cart-items");
const totalEl = document.getElementById("cart-total");
const clearBtn = document.getElementById("clear-cart");
const nameEl = document.getElementById("cust-name");
const emailEl = document.getElementById("cust-email");
const notesEl = document.getElementById("cust-notes");
document.getElementById("year").textContent = new Date().getFullYear();

// Simple cart
let cart = JSON.parse(localStorage.getItem("cart") || "[]");
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }
function addToCart(item){
  const existing = cart.find(c => c.id === item.id);
  if(existing){ existing.qty += 1; } else { cart.push({ id:item.id, name:item.name, price:item.price, qty:1 }); }
  saveCart();
}
function removeFromCart(id){ cart = cart.filter(c => c.id !== id); saveCart(); }
function updateQty(id, qty){ const c=cart.find(x=>x.id===id); if(!c) return; c.qty=Math.max(1, qty|0); saveCart(); }
function cartTotal(){ return cart.reduce((s,i)=> s + i.price*i.qty, 0); }
function renderCart(){
  cartItemsEl.innerHTML = cart.length ? "" : "<p class='muted'>Your cart is empty.</p>";
  cart.forEach(item=>{
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div>
          <strong>${item.name}</strong><br/>
          <small>$${item.price.toFixed(2)} each</small>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="number" min="1" value="${item.qty}" style="width:72px" />
          <button class="secondary remove">Remove</button>
        </div>
      </div>
    `;
    row.querySelector("input").addEventListener("change", e=> updateQty(item.id, +e.target.value));
    row.querySelector(".remove").addEventListener("click", ()=> removeFromCart(item.id));
    cartItemsEl.appendChild(row);
  });
  totalEl.textContent = `$${cartTotal().toFixed(2)}`;
}
renderCart();
clearBtn.addEventListener("click", ()=>{ cart=[]; saveCart(); });

// Render menu from Firestore (live)
function renderMenu(items){
  menuList.innerHTML = "";
  items.forEach(d=>{
    const card = document.createElement("div");
    card.className = "menu-item";
    card.innerHTML = `
      <h3>${d.name}</h3>
      ${d.desc ? `<p class="muted">${d.desc}</p>` : ""}
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>$${d.price.toFixed(2)}</strong>
        <button>Add to cart</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", ()=> addToCart(d));
    menuList.appendChild(card);
  });
}

function initMenu(){
  const q = query(collection(db, "menu"), orderBy("name"));
  onSnapshot(q, (snap)=>{
    if(snap.empty){
      // Seed/fallback UI if DB isn't seeded yet
      renderMenu([
        { id:"seed-tamales", name:"12 Tamales", price:25.00, desc:"A dozen hand-wrapped tamales." },
        { id:"seed-cookies", name:"Gourmet Chocolate Chip Cookies", price:4.00, desc:"Rich, gooey, scratch-made." }
      ]);
    } else {
      const list = snap.docs.map(doc=> ({ id: doc.id, ...doc.data() }));
      renderMenu(list);
    }
  });
}
initMenu();

// PayPal integration
function paypalItems(){
  return cart.map(i=> ({
    name: i.name,
    unit_amount: { currency_code: "USD", value: i.price.toFixed(2) },
    quantity: i.qty.toString()
  }));
}
function orderTotal(){ return cartTotal().toFixed(2); }
function validCustomer(){ return nameEl.value.trim() && /\S+@\S+\.\S+/.test(emailEl.value.trim()); }

if (window.paypal) {
  window.paypal.Buttons({
    style: { shape: 'rect', label: 'checkout' },
    onInit: (data, actions) => {
      actions.disable();
      const check = () => { (cart.length && validCustomer()) ? actions.enable() : actions.disable(); };
      ["input","change"].forEach(evt=>{
        nameEl.addEventListener(evt, check); emailEl.addEventListener(evt, check);
      });
      const obs = new MutationObserver(check);
      obs.observe(cartItemsEl, { childList:true, subtree:true });
      check();
    },
    createOrder: (data, actions) => {
      return actions.order.create({
        purchase_units: [{
          description: `Family Treats order for ${nameEl.value}`,
          amount: {
            currency_code: "USD",
            value: orderTotal(),
            breakdown: { item_total: { currency_code: "USD", value: orderTotal() } }
          },
          items: paypalItems(),
          custom_id: `notes: ${notesEl.value || ''}`
        }],
        payer: { email_address: emailEl.value, name: { given_name: nameEl.value } },
        application_context: { shipping_preference: "NO_SHIPPING" }
      });
    },
    onApprove: async (data, actions) => {
      const details = await actions.order.capture();

      // Build order snapshot
      const lineItems = cart.map(i => ({
        id: i.id, name: i.name, price: Number(i.price), qty: i.qty,
        subtotal: Number((i.price * i.qty).toFixed(2))
      }));
      const total = Number(cartTotal().toFixed(2));

      // Save to Firestore (admin-only readable)
      let docRef = null;
      try {
        docRef = await addDoc(collection(db, "orders"), {
          status: "paid",
          paypalOrderId: details.id,
          customer: { name: nameEl.value.trim(), email: emailEl.value.trim(), notes: (notesEl.value || "").trim() },
          items: lineItems,
          total,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.error("Failed to save order:", e);
        alert("Payment captured, but saving your order failed. We'll email a receipt shortly.");
      }

      // Clear & redirect to receipt
      cart = []; saveCart();
      const oid = docRef ? docRef.id : encodeURIComponent(details.id);
      window.location.href = `receipt.html?oid=${oid}`;
    },
    onError: (err) => {
      console.error(err);
      alert("Payment error. Please try again.");
    }
  }).render("#paypal-button-container");
}

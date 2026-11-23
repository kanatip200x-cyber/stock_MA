// ===== เว็บคลังสินค้า =====
// มี 2 โหมด
//  1) Supabase: ต้องล็อกอินด้วย Google, ข้อมูลสินค้า/ประวัติอยู่ในฐานข้อมูล และอัปเดตสดทุกเครื่อง (Realtime)
//  2) ออฟไลน์: ถ้ายังไม่ได้ตั้งค่า config.js ข้อมูลเก็บใน localStorage ของเบราว์เซอร์ (แบบเดิม)
const MAX_STORAGE = 4000;
const SOFT_LIMIT = MAX_STORAGE / 2;
const STORAGE_KEY = "factoryInventoryDemoStateV3"; // เปลี่ยนชื่อเพื่อล้างข้อมูลเก่าที่เคยเก็บในเบราว์เซอร์
const BASE_STOCK = 1355;
const BASE_RECORD_COUNT = 170;
const BASE_LOW_STOCK_COUNT = 147;
// ข้อมูลตัวอย่าง (สมมติ) สำหรับ demo: สินค้าดอง 4 ชนิด ชนิดละ 2 พาเลท พาเลทละ 60 ชิ้น
const defaultProducts = [
  { name: "ผักกาดดอง", sku: "DEMO-1001", qty: 60, lot: "LOT-2611-01", pallet: "P01", location: "6-2-11" },
  { name: "ผักกาดดอง", sku: "DEMO-1001", qty: 60, lot: "LOT-2611-02", pallet: "P02", location: "6-1-2" },
  { name: "ขิงดอง", sku: "DEMO-1002", qty: 60, lot: "LOT-2611-03", pallet: "P03", location: "2-2-7" },
  { name: "ขิงดอง", sku: "DEMO-1002", qty: 60, lot: "LOT-2611-04", pallet: "P04", location: "2-2-6" },
  { name: "มะนาวดอง", sku: "DEMO-1003", qty: 60, lot: "LOT-2611-05", pallet: "P05", location: "6-2-9" },
  { name: "มะนาวดอง", sku: "DEMO-1003", qty: 60, lot: "LOT-2611-06", pallet: "P06", location: "6-1-13" },
  { name: "กระเทียมดอง", sku: "DEMO-1004", qty: 60, lot: "LOT-2611-07", pallet: "P07", location: "6-1-12" },
  { name: "กระเทียมดอง", sku: "DEMO-1004", qty: 60, lot: "LOT-2611-08", pallet: "P08", location: "2-1-8" }
];

// ผู้เยี่ยมชม (เข้าด้วย PIN) ใช้ข้อมูลตัวอย่างในเบราว์เซอร์ ไม่แตะฐานข้อมูลจริง
const GUEST = !!(window.Auth && window.Auth.isGuest());
const sb = window.Auth && window.Auth.enabled && !GUEST ? window.Auth.client : null;
const ONLINE = !!sb;
// โหมด Google Sheet: สินค้าอยู่ในชีต "สินค้า" (ผ่าน Apps Script) ส่วนผู้ใช้/ประวัติยังอยู่ใน Supabase
const PRODUCTS_API = ONLINE ? ((window.SUPABASE_CONFIG || {}).productsApiUrl || "") : "";
const SHEET_MODE = !!PRODUCTS_API;
const savedState = ONLINE ? null : (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } })();
// products / arrivals ถูกใช้ร่วมกับ agv-simulator.js (แก้ค่าในอาเรย์เดิม ไม่สร้างอาเรย์ใหม่)
const products = ONLINE ? [] : (Array.isArray(savedState?.products) && savedState.products.length ? savedState.products : defaultProducts.map(p => ({ ...p })));
let arrivals = ONLINE ? [] : (Array.isArray(savedState?.arrivals) ? savedState.arrivals : []);
let todayIn = ONLINE ? 0 : Number(savedState?.todayIn) || 0;
let seconds = Number.isInteger(savedState?.seconds) && savedState.seconds > 0 ? savedState.seconds : 60;
let searchTerm = "";
let toastTimeout;
let currentUser = null;
let currentProfile = null;
let connectionState = ONLINE ? "กำลังเชื่อมต่อ..." : GUEST ? "โหมดผู้เยี่ยมชม (ข้อมูลตัวอย่าง)" : "โหมดออฟไลน์ (ข้อมูลในเบราว์เซอร์นี้)";

// ป้องกันข้อความแปลก ๆ จากฐานข้อมูลกลายเป็นโค้ด HTML
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
// โหมดออนไลน์แสดงตัวเลขจริงจากฐานข้อมูล, ออฟไลน์ใช้ตัวเลขตั้งต้นแบบเดิม
const total = () => (ONLINE ? 0 : BASE_STOCK) + products.reduce((sum, p) => sum + p.qty, 0);
const recordCount = () => (ONLINE ? 0 : BASE_RECORD_COUNT) + products.length;
const lowStockCount = () => (ONLINE ? 0 : BASE_LOW_STOCK_COUNT) + products.filter(p => p.qty <= 10).length;

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(date);
}
function saveState() {
  if (ONLINE) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ products, todayIn, arrivals, seconds }));
}
function renderProducts() {
  const visibleProducts = products.filter(p => `${p.name} ${p.sku} ${p.lot} ${p.pallet} ${p.location}`.toLowerCase().includes(searchTerm));
  document.querySelector("#productTable").innerHTML = visibleProducts.map(p => {
    const low = p.qty <= 10 ? ' class="low-stock"' : "";
    return `<tr${low}><td class="product"><button class="stock-product-button" type="button" data-stock-index="${products.indexOf(p)}">${esc(p.name)}</button></td><td class="sku">${esc(p.sku)}</td><td class="qty">${esc(p.qty)}</td><td>${esc(p.lot)}</td><td>${esc(p.pallet)}</td><td>${esc(p.location)}</td></tr>`;
  }).join("") || `<tr><td colspan="6" class="empty">${ONLINE && connectionState !== "เชื่อมต่อแล้ว" ? "กำลังโหลดข้อมูล..." : "ไม่พบข้อมูลสินค้า"}</td></tr>`;
}
function renderActivity() {
  const list = document.querySelector("#activityList");
  list.innerHTML = arrivals.length ? arrivals.slice(0, 8).map(a => {
    const moved = a.type ? a.type === "MOVE" : !!(a.action && a.action !== "รับสินค้าเข้าคลัง");
    const by = a.user_name ? ` · โดย ${esc(a.user_name)}` : "";
    return `<div class="activity"><span class="activity-icon">${moved ? "⇄" : "↓"}</span><div><strong>${esc(a.name)} <span class="activity-tag ${moved ? "is-move" : "is-in"}">${moved ? "ย้ายแล้ว" : `+${esc(a.amount)}`}</span></strong><p>${esc(a.sku)} · ${esc(a.action || "รับสินค้าเข้าคลัง")}${by}</p></div><time>${esc(a.time)}</time></div>`;
  }).join("") : '<p class="empty">ยังไม่มีรายการเคลื่อนไหวสินค้า</p>';
}
function renderStatus() {
  document.querySelectorAll("[data-api-status]").forEach(el => {
    el.textContent = connectionState;
    el.classList.toggle("status-ok", connectionState === "เชื่อมต่อแล้ว");
    el.classList.toggle("status-warn", connectionState !== "เชื่อมต่อแล้ว");
  });
}
function render() {
  document.querySelector("#todayIn").textContent = todayIn.toLocaleString("th-TH");
  document.querySelector("#skuCount").textContent = recordCount();
  document.querySelector("#movableCount").textContent = recordCount();
  document.querySelector("#originalItemCount").textContent = recordCount();
  document.querySelector("#originalTotalQty").textContent = total().toLocaleString("th-TH");
  document.querySelector("#originalLowStock").textContent = lowStockCount();
  document.querySelector("#lastUpdated").textContent = formatTime();
  renderStatus(); renderProducts(); renderActivity();
  saveState();
}
function showToast(title, text) {
  document.querySelector("#toastTitle").textContent = title;
  document.querySelector("#toastText").textContent = text;
  const toast = document.querySelector("#toast");
  toast.classList.add("show"); clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 4500);
}

// ===== ส่วนเชื่อมฐานข้อมูล Supabase =====
const movementToArrival = m => ({
  id: m.id, type: m.type, name: m.name, sku: m.sku, amount: m.qty, qty: m.qty, lot: m.lot, pallet: m.pallet,
  user_name: m.user_name, time: formatTime(new Date(m.created_at)),
  action: m.type === "MOVE" ? `ขนย้าย ${m.from_location} → ${m.to_location}` : "รับสินค้าเข้าคลัง",
});
function upsertProduct(row) {
  const existing = products.find(p => p.id === row.id);
  if (existing) Object.assign(existing, row); // คงอ็อบเจกต์เดิมไว้ ให้ popup/AGV ยังอ้างอิงได้
  else products.unshift(row);
}
// เรียก Apps Script ของชีต "สินค้า" พร้อมแนบ token ของผู้ที่ล็อกอิน (ใช้ POST เพื่อไม่ให้ token ไปอยู่ใน URL)
async function sheetCall(action, payload = {}) {
  const { data } = await sb.auth.getSession();
  const res = await fetch(PRODUCTS_API, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, action, access_token: data.session?.access_token || "" }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Google Sheet ตอบกลับผิดพลาด");
  return json;
}
async function recordMovement(row) {
  const { error } = await sb.from("stock_movements").insert({ ...row, user_name: currentProfile?.full_name || currentUser?.email });
  if (error) console.warn("[Supabase] บันทึกประวัติไม่สำเร็จ", error);
}
async function loadFromDatabase() {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const [prod, moves, today, locs] = await Promise.all([
    SHEET_MODE
      ? sheetCall("list").then(r => ({ data: r.products, error: null }), error => ({ data: null, error }))
      : sb.from("products").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }),
    sb.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(20),
    sb.from("stock_movements").select("qty").eq("type", "IN").gte("created_at", startOfDay.toISOString()),
    sb.from("locations").select("*").eq("is_destination", true).order("sort_order"),
  ]);
  const err = prod.error || moves.error || today.error;
  if (err) throw err;
  const ids = new Set(prod.data.map(p => p.id));
  for (let i = products.length - 1; i >= 0; i--) if (!ids.has(products[i].id)) products.splice(i, 1);
  prod.data.slice().reverse().forEach(upsertProduct);
  if (!SHEET_MODE) products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id);
  else products.sort((a, b) => b.id - a.id);
  arrivals = moves.data.map(movementToArrival);
  todayIn = today.data.reduce((s, r) => s + r.qty, 0);
  if (!locs.error && locs.data.length) fillDestinations(locs.data);
  connectionState = "เชื่อมต่อแล้ว";
  render();
}
function fillDestinations(rows) {
  const select = document.querySelector("#moveDestination");
  const keep = select.value;
  select.innerHTML = rows.map(l => `<option value="${esc(l.code)}">${esc(l.label)}</option>`).join("");
  if ([...select.options].some(o => o.value === keep)) select.value = keep;
}
let reloadTimer;
const scheduleReload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => loadFromDatabase().catch(handleDbError), 300); };
function handleDbError(error) {
  console.error("[Supabase]", error);
  connectionState = "เชื่อมต่อไม่สำเร็จ";
  render();
  showToast("เชื่อมต่อฐานข้อมูลไม่สำเร็จ", error.message || String(error));
}
function subscribeRealtime() {
  sb.channel("inventory-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, scheduleReload)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "stock_movements" }, scheduleReload)
    .subscribe(status => { if (status === "SUBSCRIBED") document.querySelector(".live-label")?.classList.add("is-live"); });
  // ชีตไม่มี realtime: ดึงข้อมูลใหม่ทุก 20 วินาที (เฉพาะตอนเปิดแท็บดูอยู่)
  if (SHEET_MODE) setInterval(() => { if (!document.hidden) scheduleReload(); }, 20000);
}
// เรียกจาก agv-simulator.js เมื่อขนย้ายครบ 3 ขั้นตอน
window.persistMove = async function (product, from, to) {
  if (!ONLINE) return true;
  if (SHEET_MODE) {
    try {
      const { product: row } = await sheetCall("move", { id: product.id, to, note: "ขนย้าย 3 ขั้นตอน (AGV)" });
      Object.assign(product, row);
      await recordMovement({ type: "MOVE", name: row.name, sku: row.sku, qty: row.qty, lot: row.lot, pallet: row.pallet, from_location: from, to_location: to, note: "ขนย้าย 3 ขั้นตอน (AGV)" });
      scheduleReload();
      return true;
    } catch (e) { product.location = from; handleDbError(e); return false; }
  }
  const { data, error } = await sb.rpc("move_product", { p_product_id: product.id, p_to: to, p_note: "ขนย้าย 3 ขั้นตอน (AGV)" });
  if (error) { product.location = from; handleDbError(error); return false; }
  Object.assign(product, data);
  scheduleReload();
  return true;
};

// ===== รับสินค้าเข้า =====
let receiving = false;
async function receiveRandomProduct(manual = false) {
  if (!manual) seconds = 60;
  const available = SOFT_LIMIT - total();
  if (available <= 0) {
    showToast("ไม่สามารถรับสินค้าเข้าได้", "พื้นที่จัดเก็บไม่เพียงพอสำหรับรายการนี้");
    return;
  }
  const template = products[Math.floor(Math.random() * products.length)] || defaultProducts[0];
  const desired = Math.floor(Math.random() * 31) + 10;
  const amount = Math.min(desired, available);
  const draft = { name: template.name, sku: template.sku, qty: amount, lot: `IN-${Date.now().toString().slice(-6)}`, pallet: "รับเข้า", location: "พื้นที่รับเข้า" };
  const note = manual ? "กดรับสินค้าเข้า" : "รับเข้าอัตโนมัติ";
  if (ONLINE) {
    if (receiving) return;
    receiving = true;
    try {
      let data, error;
      if (SHEET_MODE) {
        try {
          data = (await sheetCall("receive", { ...draft, qty: amount, note })).product;
          await recordMovement({ type: "IN", name: data.name, sku: data.sku, qty: amount, lot: data.lot, pallet: data.pallet, from_location: null, to_location: data.location, note });
        } catch (e) { error = e; }
      } else {
        ({ data, error } = await sb.rpc("receive_product", { p_name: draft.name, p_sku: draft.sku, p_qty: amount, p_lot: draft.lot, p_pallet: draft.pallet, p_location: draft.location, p_note: note }));
      }
      if (error) return handleDbError(error);
      upsertProduct(data); todayIn += amount;
      arrivals.unshift({ ...data, type: "IN", amount, time: formatTime(), action: "รับสินค้าเข้าคลัง", user_name: currentProfile?.full_name || currentUser?.email });
      render();
    } finally { receiving = false; }
  } else {
    products.unshift(draft); todayIn += amount;
    arrivals.unshift({ ...draft, amount, time: formatTime(), action: "รับสินค้าเข้าคลัง" });
    render();
  }
  showToast("รับสินค้าเรียบร้อย", `${draft.name} เพิ่มเข้า ${amount} หน่วย`);
  logStockToSheet({ type: "IN", name: draft.name, sku: draft.sku, qty: amount, lot: draft.lot, pallet: draft.pallet, from: "", to: draft.location, note, user: currentUser?.email || "" });
}
function tick() {
  if (document.hidden && ONLINE) return; // ไม่รับเข้าอัตโนมัติจากแท็บที่ไม่ได้เปิดดู
  seconds -= 1;
  if (seconds <= 0) receiveRandomProduct();
  saveState();
}
document.querySelector("#receiveNow").addEventListener("click", () => receiveRandomProduct(true));
document.querySelector("#stockSearch").addEventListener("input", event => { searchTerm = event.target.value.toLowerCase().trim(); renderProducts(); });

// ===== Popup รายละเอียดสินค้า =====
const detailModal = document.querySelector("#stockDetailModal");
const detailContent = document.querySelector("#detailContent");
let detailProduct = null;
let activeDetailTab = "basic";
function renderDetailModal() {
  if (!detailProduct) return;
  const rows = activeDetailTab === "basic"
    ? [["สินค้า", detailProduct.name], ["รหัสวัสดุ", detailProduct.sku], ["จำนวน", `${detailProduct.qty} หน่วย`], ["สถานะ", detailProduct.qty <= 10 ? "ใกล้หมด" : "พร้อมใช้"]]
    : activeDetailTab === "location"
      ? [["ล็อต/แบทช์", detailProduct.lot], ["เลขพาเลท", detailProduct.pallet], ["คลัง/พื้นที่", detailProduct.location]]
      : null;
  detailContent.innerHTML = rows ? rows.map(([label, value]) => `<div class="detail-row"><span class="detail-label">${esc(label)}</span><span class="detail-value">${esc(value)}</span></div>`).join("") : `<pre class="detail-json">${esc(JSON.stringify(detailProduct, null, 2))}</pre>`;
}
function openDetail(product) { detailProduct = product; activeDetailTab = "basic"; document.querySelectorAll(".detail-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.detailTab === activeDetailTab)); renderDetailModal(); detailModal.classList.add("active"); detailModal.setAttribute("aria-hidden", "false"); }
function closeDetail() { detailModal.classList.remove("active"); detailModal.setAttribute("aria-hidden", "true"); }
document.querySelector("#productTable").addEventListener("click", event => { const button = event.target.closest("[data-stock-index]"); if (button) openDetail(products[Number(button.dataset.stockIndex)]); });
document.querySelector("#detailClose").addEventListener("click", closeDetail);
detailModal.addEventListener("click", event => { if (event.target === detailModal) closeDetail(); });
document.querySelectorAll(".detail-tab").forEach(tab => tab.addEventListener("click", () => { activeDetailTab = tab.dataset.detailTab; document.querySelectorAll(".detail-tab").forEach(item => item.classList.toggle("active", item === tab)); renderDetailModal(); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") closeDetail(); });

// ===== เมนูด้านข้าง =====
const sidebar = document.querySelector("#sidebar");
const overlay = document.querySelector("#overlay");
const toggleMenu = () => { sidebar.classList.toggle("active"); overlay.classList.toggle("active"); };
document.querySelector("#menuButton").addEventListener("click", toggleMenu);
document.querySelector("#closeButton").addEventListener("click", toggleMenu);
overlay.addEventListener("click", toggleMenu);
document.querySelectorAll(".sidebar-menu a").forEach(link => link.addEventListener("click", () => {
  document.querySelectorAll(".sidebar-menu a").forEach(a => a.classList.toggle("active-menu", a === link));
  if (sidebar.classList.contains("active")) toggleMenu();
}));

// ===== ผู้ใช้ที่ล็อกอิน =====
function renderUser() {
  const nameEl = document.querySelector("#userName");
  const roleEl = document.querySelector("#userRole");
  const avatarEl = document.querySelector("#userAvatar");
  const logoutBtn = document.querySelector("#logoutButton");
  if (GUEST) {
    nameEl.textContent = "ผู้เยี่ยมชม"; roleEl.textContent = "GUEST"; roleEl.className = "role-badge badge-guest";
    logoutBtn.textContent = "ออก"; logoutBtn.hidden = false;
    logoutBtn.addEventListener("click", () => Auth.signOut());
    return;
  }
  if (!ONLINE) { nameEl.textContent = "Demo User"; roleEl.textContent = "OFFLINE"; logoutBtn.hidden = true; return; }
  const name = currentProfile?.full_name || currentUser.user_metadata?.full_name || currentUser.email;
  const role = (currentProfile?.role || "staff").toUpperCase();
  nameEl.textContent = name;
  nameEl.title = currentUser.email;
  roleEl.textContent = role;
  roleEl.className = `role-badge ${role === "ADMIN" ? "badge-admin" : "badge-staff"}`;
  const avatar = currentProfile?.avatar_url || currentUser.user_metadata?.avatar_url;
  if (avatar) { avatarEl.innerHTML = `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">`; }
  logoutBtn.hidden = false;
  logoutBtn.addEventListener("click", () => Auth.signOut());
}

// ===== เริ่มทำงาน =====
(async () => {
  if (ONLINE) {
    const session = await Auth.requireLogin();
    currentUser = session.user; currentProfile = session.profile;
    document.body.classList.remove("auth-pending");
    renderUser();
    render();
    try { await loadFromDatabase(); subscribeRealtime(); } catch (e) { handleDbError(e); }
  } else {
    document.body.classList.remove("auth-pending");
    renderUser();
    render();
  }
  setInterval(tick, 1000);
})();

const MAX_STORAGE = 4000;
const SOFT_LIMIT = MAX_STORAGE / 2;
const STORAGE_KEY = "factoryInventoryOriginalStateV2";
const ORIGINAL_RECORD_COUNT = 180;
const BASE_STOCK = 1355;
const BASE_RECORD_COUNT = 170;
const BASE_LOW_STOCK_COUNT = 147;
const defaultProducts = [
  { name: 'ผักเปรี้ยวไม่ใส่ VCP "Wei Chuan" 300g.*36ถุง-กล่อง', sku: "07012541", qty: 64, lot: "—", pallet: "—", location: "6-2-11" },
  { name: 'ผักเปรี้ยวไม่ใส่ VCP "Wei Chuan" 300g.*36ถุง-กล่อง', sku: "07012541", qty: 64, lot: "—", pallet: "—", location: "6-1-2" },
  { name: "วัสดุพื้นฐาน", sku: "1001", qty: 1, lot: "—", pallet: "—", location: "2-2-7" },
  { name: "วัสดุพื้นฐาน", sku: "1001", qty: 1, lot: "—", pallet: "—", location: "2-2-6" },
  { name: 'ผักเปรี้ยวไม่ใส่ VCP "Wei Chuan" 300g.*36ถุง-กล่อง', sku: "07012541", qty: 64, lot: "2610/0544", pallet: "10", location: "6-2-9" },
  { name: 'ผักเปรี้ยวไม่ใส่ VCP "Wei Chuan" 300g.*36ถุง-กล่อง', sku: "07012541", qty: 64, lot: "2610/0544", pallet: "09", location: "6-1-13" },
  { name: 'ผักเปรี้ยวไม่ใส่ VCP "Wei Chuan" 300g.*36ถุง-กล่อง', sku: "07012541", qty: 64, lot: "—", pallet: "—", location: "6-1-12" },
  { name: 'ผักเปรี้ยวไม่ใส่ VCP "Wei Chuan" 300g.*36ถุง-กล่อง', sku: "07012541", qty: 1, lot: "2610/0544", pallet: "07", location: "6-1-11" },
  { name: "วัสดุพื้นฐาน", sku: "1001", qty: 1, lot: "—", pallet: "—", location: "2-1-8" },
  { name: 'ผักเปรี้ยวไม่ใส่ VCP "Wei Chuan" 300g.*36ถุง-กล่อง', sku: "07012541", qty: 64, lot: "—", pallet: "—", location: "6-1-8" }
];
const savedState = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } })();
const products = Array.isArray(savedState?.products) && savedState.products.length ? savedState.products : defaultProducts;
let todayIn = Number(savedState?.todayIn) || 0;
let arrivals = Array.isArray(savedState?.arrivals) ? savedState.arrivals : [];
let seconds = Number.isInteger(savedState?.seconds) && savedState.seconds > 0 ? savedState.seconds : 60;
let searchTerm = "";
let toastTimeout;
const total = () => BASE_STOCK + products.reduce((sum, product) => sum + product.qty, 0);
const recordCount = () => BASE_RECORD_COUNT + products.length;
const lowStockCount = () => BASE_LOW_STOCK_COUNT + products.filter(product => product.qty <= 10).length;

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(date);
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ products, todayIn, arrivals, seconds }));
}
function renderProducts() {
  const visibleProducts = products.filter(p => `${p.name} ${p.sku} ${p.lot} ${p.pallet}`.toLowerCase().includes(searchTerm));
  document.querySelector("#productTable").innerHTML = visibleProducts.map(p => {
    return `<tr><td class="product"><button class="stock-product-button" type="button" data-stock-index="${products.indexOf(p)}">${p.name}</button></td><td class="sku">${p.sku}</td><td class="qty">${p.qty}</td><td>${p.lot}</td><td>${p.pallet}</td><td>${p.location}</td></tr>`;
  }).join("") || '<tr><td colspan="6" class="empty">ไม่พบข้อมูลสินค้า</td></tr>';
}
function renderActivity() {
  const list = document.querySelector("#activityList");
  list.innerHTML = arrivals.length ? arrivals.slice(0, 5).map(a => `<div class="activity"><span class="activity-icon">${a.action ? "⇄" : "↓"}</span><div><strong>${a.name} <span style="color:#3da383">${a.action ? "ย้ายแล้ว" : `+${a.amount}`}</span></strong><p>${a.sku} · ${a.action || "รับสินค้าเข้าคลัง"}</p></div><time>${a.time}</time></div>`).join("") : '<p class="empty">ยังไม่มีรายการเคลื่อนไหวสินค้า</p>';
}
function render() {
  const used = total();
  const percentage = (used / MAX_STORAGE) * 100;
  document.querySelector("#todayIn").textContent = todayIn;
  document.querySelector("#skuCount").textContent = recordCount();
  document.querySelector("#movableCount").textContent = recordCount();
  document.querySelector("#originalItemCount").textContent = recordCount();
  document.querySelector("#originalTotalQty").textContent = total().toLocaleString("th-TH");
  document.querySelector("#originalLowStock").textContent = lowStockCount();
  document.querySelector("#lastUpdated").textContent = formatTime();
  renderProducts(); renderActivity();
  saveState();
}
function showToast(title, text) {
  document.querySelector("#toastTitle").textContent = title;
  document.querySelector("#toastText").textContent = text;
  const toast = document.querySelector("#toast");
  toast.classList.add("show"); clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 4500);
}
function receiveRandomProduct(manual = false) {
  const available = SOFT_LIMIT - total();
  if (available <= 0) {
    showToast("ไม่สามารถรับสินค้าเข้าได้", "พื้นที่จัดเก็บไม่เพียงพอสำหรับรายการนี้");
    return;
  }
  const template = products[Math.floor(Math.random() * products.length)] || defaultProducts[0];
  const desired = Math.floor(Math.random() * 31) + 10;
  const amount = Math.min(desired, available);
  const product = { ...template, qty: amount, lot: `IN-${Date.now().toString().slice(-6)}`, pallet: "รับเข้า", location: "พื้นที่รับเข้า" };
  products.unshift(product); todayIn += amount;
  arrivals.unshift({ ...product, amount, time: formatTime(), action: "รับสินค้าเข้าคลัง" });
  render();
  showToast("รับสินค้าเรียบร้อย", `${product.name} เพิ่มเข้า ${amount} หน่วย`);
  logStockToSheet({ type: "IN", name: product.name, sku: product.sku, qty: amount, lot: product.lot, pallet: product.pallet, from: "", to: product.location, note: manual ? "กดรับสินค้าเข้า" : "รับเข้าอัตโนมัติ" });
  if (!manual) seconds = 60;
}
function tick() {
  seconds -= 1;
  if (seconds <= 0) receiveRandomProduct();
  saveState();
}
document.querySelector("#receiveNow").addEventListener("click", () => receiveRandomProduct(true));
document.querySelector("#stockSearch").addEventListener("input", event => { searchTerm = event.target.value.toLowerCase().trim(); renderProducts(); });
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
  detailContent.innerHTML = rows ? rows.map(([label, value]) => `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>`).join("") : `<pre class="detail-json">${JSON.stringify(detailProduct, null, 2)}</pre>`;
}
function openDetail(product) { detailProduct = product; activeDetailTab = "basic"; document.querySelectorAll(".detail-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.detailTab === activeDetailTab)); renderDetailModal(); detailModal.classList.add("active"); detailModal.setAttribute("aria-hidden", "false"); }
function closeDetail() { detailModal.classList.remove("active"); detailModal.setAttribute("aria-hidden", "true"); }
document.querySelector("#productTable").addEventListener("click", event => { const button = event.target.closest("[data-stock-index]"); if (button) openDetail(products[Number(button.dataset.stockIndex)]); });
document.querySelector("#detailClose").addEventListener("click", closeDetail);
detailModal.addEventListener("click", event => { if (event.target === detailModal) closeDetail(); });
document.querySelectorAll(".detail-tab").forEach(tab => tab.addEventListener("click", () => { activeDetailTab = tab.dataset.detailTab; document.querySelectorAll(".detail-tab").forEach(item => item.classList.toggle("active", item === tab)); renderDetailModal(); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") closeDetail(); });
const sidebar = document.querySelector("#sidebar");
const overlay = document.querySelector("#overlay");
const toggleMenu = () => { sidebar.classList.toggle("active"); overlay.classList.toggle("active"); };
document.querySelector("#menuButton").addEventListener("click", toggleMenu);
document.querySelector("#closeButton").addEventListener("click", toggleMenu);
overlay.addEventListener("click", toggleMenu);
render(); setInterval(tick, 1000);

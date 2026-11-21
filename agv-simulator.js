/*
 * ขนย้ายสินค้าด้วย AGV แบบ 3 ขั้นตอน (ขั้นละ 5 วินาที)
 *   1. นำภาชนะมารอที่จุดรับสินค้า
 *   2. นำสินค้าวางบนภาชนะ
 *   3. นำสินค้าพร้อมภาชนะ ไปยังปลายทาง
 * ทำงานใน popup รายละเอียดสินค้าเดิม (#stockDetailModal) ใช้ปุ่ม #moveStockButton และ select #moveDestination
 * อ่านตัวแปรจาก app.js: detailProduct, products, arrivals และเรียก render(), renderDetailModal(), showToast(), formatTime()
 */
(() => {
  const STEP_MS = 5000;
  const STEPS = [
    { title: "นำภาชนะมารอที่จุดรับสินค้า", text: job => `AGV นำภาชนะเปล่ามารอที่จุดรับสินค้า ${job.from}` },
    { title: "นำสินค้าวางบนภาชนะ", text: job => `นำ ${job.product.name} (${job.product.qty} หน่วย) วางบนภาชนะ` },
    { title: "นำสินค้าพร้อมภาชนะ ไปยังปลายทาง", text: job => `AGV ขนสินค้าพร้อมภาชนะจาก ${job.from} ไป ${job.to}` },
  ];

  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "agv-simulator.css";
  document.head.appendChild(css);

  const moveAction = document.querySelector(".move-action");
  const select = document.querySelector("#moveDestination");
  const button = document.querySelector("#moveStockButton");
  const panel = document.createElement("div");
  panel.className = "move-steps";
  panel.id = "moveSteps";
  moveAction.after(panel);

  let job = null;           // { product, from, to, step, stepStart, done }
  let tickTimer = null;

  const current = () => (typeof detailProduct !== "undefined" ? detailProduct : null);

  function paint() {
    const product = current();
    const mine = job && job.product === product;
    const busyOther = job && !job.done && !mine;
    select.disabled = !!(job && !job.done && mine);
    button.disabled = !!(job && !job.done);
    button.textContent = busyOther ? "AGV กำลังขนย้ายสินค้าอื่น" : mine && !job.done ? "กำลังขนย้าย..." : "🚚 เริ่มขนย้าย";
    if (!mine) { panel.innerHTML = ""; panel.hidden = true; return; }
    panel.hidden = false;
    const now = Date.now();
    panel.innerHTML = `
      <div class="move-steps-head"><b>ขนย้าย ${job.from} → ${job.to}</b><span>${job.done ? "เสร็จสิ้น" : `ขั้นตอนที่ ${job.step + 1}/3 · เหลือ ${Math.max(0, Math.ceil((job.stepStart + STEP_MS - now) / 1000))} วิ`}</span></div>
      <ol>${STEPS.map((s, i) => {
        const state = job.done || i < job.step ? "done" : i === job.step ? "active" : "pending";
        const pct = state === "done" ? 100 : state === "active" ? Math.min(100, ((now - job.stepStart) / STEP_MS) * 100) : 0;
        return `<li class="ms-${state}"><span class="ms-num">${state === "done" ? "✓" : i + 1}</span><div><strong>${s.title}</strong><p>${s.text(job)}</p><div class="ms-bar"><i style="width:${pct}%"></i></div></div></li>`;
      }).join("")}</ol>`;
  }

  function start() {
    const product = current();
    if (!product) return;
    if (job && !job.done) { showToast("AGV ไม่ว่าง", "กรุณารอให้การขนย้ายปัจจุบันเสร็จก่อน"); return; }
    const to = select.value, from = product.location;
    if (from === to) { showToast("เลือกตำแหน่งเดิม", "กรุณาเลือกปลายทางอื่นสำหรับการขนย้าย"); return; }
    if (!products.includes(product)) { showToast("ไม่พบสินค้า", "รายการนี้ไม่อยู่ในคลังแล้ว"); return; }
    job = { product, from, to, step: 0, stepStart: Date.now(), done: false };
    showToast("เริ่มขนย้าย", `${product.name} จาก ${from} ไป ${to}`);
    tickTimer = setInterval(tick, 200);
    paint();
  }

  function tick() {
    if (Date.now() - job.stepStart >= STEP_MS) {
      if (job.step < STEPS.length - 1) { job.step += 1; job.stepStart = Date.now(); }
      else return finish();
    }
    paint();
  }

  function finish() {
    clearInterval(tickTimer); tickTimer = null;
    job.done = true;
    const { product, from, to } = job;
    product.location = to;
    arrivals.unshift({ ...product, amount: product.qty, time: formatTime(), action: `ขนย้าย ${from} → ${to}` });
    render();
    if (current() === product) renderDetailModal();
    showToast("ขนย้ายสำเร็จ", `${product.name} จาก ${from} ไป ${to}`);
    if (typeof logStockToSheet === "function") {
      logStockToSheet({ type: "OUT", name: product.name, sku: product.sku, qty: product.qty, lot: product.lot, pallet: product.pallet, from, to, note: "ขนย้าย 3 ขั้นตอน (AGV)" });
    }
    paint();
  }

  // ตั้งปลายทางเริ่มต้นให้ไม่ตรงกับตำแหน่งเดิม ทุกครั้งที่เปิด popup
  document.querySelector("#productTable").addEventListener("click", event => {
    if (!event.target.closest("[data-stock-index]")) return;
    const product = current();
    if (product && !(job && !job.done && job.product === product) && select.value === product.location) {
      const other = [...select.options].find(o => o.value !== product.location);
      if (other) select.value = other.value;
    }
    paint();
  });
  button.addEventListener("click", start);
  paint();

  window.AGVMove = { get job() { return job; }, STEP_MS };
})();

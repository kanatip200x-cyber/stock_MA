/*
 * AGV 3-Step Stock Move Simulator
 * ลำดับงานตาม AGV_3_STEP_LIBRARY.md (ทำงานภายในหน้าเว็บ ไม่เชื่อมต่อ WMS/Backend จริง)
 * - Worker ตรวจคิวทุก 5 วินาทีต่อรอบ (POLL_MS)
 * - Step 1: Partition 3 → IN   (task type 6, WAIT_FOR_LINKED_STOCK)
 * - Step 2: ต้นทาง → OUT        (task type 1, WAIT_FOR_WMS_MATCH รอ STARTED/3)
 * - Step 3: OUT → ปลายทาง       (task type 1, WAIT_FOR_WMS_MATCH รอ status 20) ไม่มีถ้าเลือก Manual
 * โมดูลนี้ไม่แก้ logic ใน app.js: อ่าน detailProduct / products และเรียก render(), showToast() ที่มีอยู่แล้ว
 */
(() => {
  const POLL_MS = 5000;              // 1 รอบ = 5 วินาที
  const EMPTY_RETRY_MS = 10000;      // ไม่พบภาชนะเปล่า ลองใหม่หลัง 10 วินาที
  const MISS_LIMIT = 3;              // WMS task หาย 3 รอบติด → อนุมานว่าจบแล้ว
  const CFG = Object.assign({
    step1: { taskType: 6, agvType: 2, priority: 61 },
    step2: { taskType: 1, agvType: 7, priority: 61 },
    step3: { taskType: 1, agvType: 2, priority: 61 },
    emptyContainerPartitionIds: [],  // ว่าง → fallback Partition 5
  }, window.AGV_CONFIG || {});
  const IN_PARTITION = "P-IN";
  const OUT_PARTITION = "P-OUT";
  const SCENARIOS = {
    normal: "ปกติ: IN/OUT ว่าง (0/0)",
    skip: "IN=1 / OUT=0 → ข้าม Step 1",
    busy: "IN/OUT ไม่ว่าง 2 รอบแรก → รอ",
    noEmpty: "ไม่พบภาชนะเปล่าครั้งแรก → ลองใหม่ 10 วิ",
    missing: "WMS task ของ Step 2 หายจากรายการ",
    error: "WMS task ของ Step 2 ได้ status 22 → error",
  };
  const STATUS_LABEL = { 1: "1 สร้างแล้ว", 3: "3 STARTED", 20: "20 เสร็จ", 22: "22 ผิดพลาด" };
  const activeQueue = new Set();     // จำลอง active AGV three-step queue

  /* ---------- UI ---------- */
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "agv-simulator.css";
  document.head.appendChild(css);

  const overlay = document.createElement("div");
  overlay.className = "stock-detail-overlay agv-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
  <section class="stock-detail-modal agv-modal" role="dialog" aria-modal="true" aria-labelledby="agvTitle">
    <div class="detail-header"><h2 id="agvTitle">🤖 AGV 3-Step Stock Move</h2><button class="detail-close" id="agvClose" aria-label="ปิด">✕</button></div>
    <p class="agv-sub" id="agvItem"></p>
    <div class="agv-controls">
      <label>ปลายทาง<select id="agvDest"></select></label>
      <div class="agv-buttons">
        <button type="button" id="agvStart">▶ ส่งงาน AGV</button>
      </div>
    </div>
    <div class="agv-clock"><span>Job: <b id="agvJob">—</b></span><span>สถานะ: <b id="agvJobStatus">ยังไม่ส่ง</b></span><span>รอบที่ <b id="agvRound">0</b> · T+<b id="agvT">0</b>s</span><span>รอบถัดไปใน <b id="agvCountdown">—</b></span></div>
    <div class="agv-steps" id="agvSteps"></div>
    <h3 class="agv-h">Log การทำงาน</h3>
    <ol class="agv-log" id="agvLog"></ol>
    <details class="agv-json"><summary>Job payload (POST /api/agv/submit-job)</summary><pre id="agvPayload"></pre></details>
  </section>`;
  document.body.appendChild(overlay);
  const $ = sel => overlay.querySelector(sel);

  const openBtn = document.createElement("button");
  openBtn.type = "button"; openBtn.id = "agvOpenButton"; openBtn.className = "agv-open";
  openBtn.textContent = "🤖 ส่งงาน AGV 3 Steps";
  document.querySelector(".move-action")?.appendChild(openBtn);

  /* ---------- State ---------- */
  let sim = null, timer = null, countdownTimer = null, nextAt = 0;
  let wmsSeq = 1000;

  const positionKey = loc => {
    const parts = String(loc || "").split("-");
    return parts.length === 3 ? parts.join("|") : `?|?|${loc}`;
  };

  function buildJob(product, destination, scenario) {
    const key = positionKey(product.location);
    const p3 = CFG.emptyContainerPartitionIds.length ? CFG.emptyContainerPartitionIds : ["5"];
    const manual = destination === "Manual";
    const inStockId = `IN-${key}`, outStockId = `OUT-${key}`;
    const stockPartition = `P-${String(product.location).split("-")[0] || "?"}`;
    const selectedStockId = `STK-${product.sku}-${product.location}`;
    const steps = [
      { stepName: "Step 1: Partition 3 → IN", executeCondition: "WAIT_FOR_LINKED_STOCK", emptyContainerPartitionIds: p3,
        linkedStockGate: { inPartitionId: IN_PARTITION, outPartitionId: OUT_PARTITION, positionKey: key },
        payload: { ...CFG.step1, startPartitionId: p3[0], endPartitionId: IN_PARTITION, endStockId: inStockId, inboundMaterialDetail: [{ name: product.name, sku: product.sku, qty: product.qty }] } },
      { stepName: "Step 2: ต้นทาง → OUT", executeCondition: "WAIT_FOR_WMS_MATCH",
        waitForMatch: { taskType: CFG.step1.taskType, startPartitionId: p3[0], endPartitionId: IN_PARTITION, endStockId: inStockId }, expectedStatus: "STARTED",
        payload: { ...CFG.step2, startPartitionId: stockPartition, startStockId: selectedStockId, endPartitionId: OUT_PARTITION, endStockId: outStockId } },
    ];
    if (!manual) steps.push({ stepName: `Step 3: OUT → ${destination}`, executeCondition: "WAIT_FOR_WMS_MATCH",
      waitForMatch: { taskType: CFG.step2.taskType, startPartitionId: stockPartition, endPartitionId: OUT_PARTITION, endStockId: outStockId }, expectedStatus: 20,
      payload: { ...CFG.step3, startPartitionId: OUT_PARTITION, startStockId: outStockId, endPartitionId: destination, endStockId: "" } });
    return { jobName: `MOVE-${product.sku}-${product.location}`, steps, token: "<WMS_ACCESS_TOKEN>" };
  }

  function newSim(product, destination, scenario) {
    const job = buildJob(product, destination, scenario);
    return {
      product, destination, scenario, job, round: 0, t: 0, jobId: null, status: "idle",
      current: 0, retryUntil: 0, linkedChecks: 0, emptySearches: 0,
      steps: job.steps.map(s => ({ name: s.stepName, cond: s.executeCondition, state: "pending", note: "รอคิว", taskId: null, miss: 0 })),
      tasks: {},  // taskId → { status, visible, stepIdx }
      log: [],
    };
  }

  const log = (msg, kind = "") => sim.log.unshift({ t: sim.t, round: sim.round, msg, kind });

  /* ---------- Preflight + submit ---------- */
  function submit() {
    const p = sim.product;
    const stockStatus = p.qty > 0 ? 2 : 0;   // จำลอง: มีของในตำแหน่ง = stockStatus 2
    log(`ตรวจสถานะสินค้าจาก WMS: stockStatus=${stockStatus}`, stockStatus === 2 ? "ok" : "err");
    if (stockStatus !== 2) return fail("สินค้าไม่อยู่ในสถานะ stockStatus=2");
    if (activeQueue.has(sim.job.jobName)) return fail("สินค้านี้อยู่ใน active AGV three-step queue แล้ว");
    log("ไม่อยู่ใน active AGV three-step queue", "ok");
    if (positionKey(p.location).startsWith("?")) return fail(`หา IN/OUT ที่จับคู่ไม่ได้ (ตำแหน่ง "${p.location}" ไม่ใช่ layer-row-column)`);
    log(`พบคู่ IN/OUT ที่ positionKey ${positionKey(p.location)}`, "ok");
    const p3 = sim.job.steps[0].emptyContainerPartitionIds;
    log(`Partition 3 สำหรับหาภาชนะเปล่า: ${p3.join(", ")}${CFG.emptyContainerPartitionIds.length ? "" : " (fallback)"}`);
    sim.jobId = `JOB-${Date.now().toString().slice(-6)}`;
    sim.status = "running";
    activeQueue.add(sim.job.jobName);
    log(`POST /api/agv/submit-job → HTTP 202, Job ID ${sim.jobId} (status running, ${sim.steps.length} Steps)`, "ok");
    sim.steps[0].state = "waiting"; sim.steps[0].note = "รอ Worker รอบแรก";
    return true;
  }

  function fail(reason) {
    sim.status = "error"; log(`✕ ${reason}`, "err");
    activeQueue.delete(sim.job.jobName);
    stopAuto(); paint();
    return false;
  }

  /* ---------- WMS (จำลอง) ---------- */
  function createTask(idx) {
    const id = `WMS-${++wmsSeq}`;
    const pl = sim.job.steps[idx].payload;
    sim.tasks[id] = { status: 1, visible: true, stepIdx: idx, age: 0 };
    const s = sim.steps[idx];
    s.taskId = id; s.state = "created"; s.note = `สร้าง ${id} (type ${pl.taskType}, agvType ${pl.agvType}) status 1`;
    log(`POST /admin-api/transaction/task/create → ${id}: ${pl.startPartitionId} → ${pl.endPartitionId} (taskType ${pl.taskType}, agvType ${pl.agvType}, priority ${pl.priority})`, "ok");
    return id;
  }

  function advanceWms() {
    Object.entries(sim.tasks).forEach(([id, task]) => {
      if (!task.visible || task.status >= 20) return;
      task.age += 1;
      const prev = task.status;
      if (task.status === 1) task.status = 3;
      else if (task.status === 3) {
        if (task.stepIdx === 1 && sim.scenario === "error") task.status = 22;
        else if (task.stepIdx === 1 && sim.scenario === "missing") { task.visible = false; log(`WMS: ${id} หายจากรายการ task`, "warn"); return; }
        else task.status = 20;
      }
      if (prev !== task.status) {
        log(`WMS: ${id} status ${STATUS_LABEL[prev]} → ${STATUS_LABEL[task.status]}`);
        const s = sim.steps[task.stepIdx];
        s.note = `${id} status ${STATUS_LABEL[task.status]}`;
        if (task.status === 20) s.state = "done";
      }
    });
  }

  /* ---------- Worker 1 รอบ ---------- */
  function pollOnce() {
    if (!sim || sim.status !== "running") return;
    sim.round += 1; sim.t += POLL_MS / 1000;
    log(`— Worker รอบที่ ${sim.round} (ตรวจคิวทุก 5 วินาที) —`, "round");
    advanceWms();

    const idx = sim.current;
    if (idx < sim.steps.length) {
      const step = sim.steps[idx];
      if (step.cond === "WAIT_FOR_LINKED_STOCK") runStep1(step);
      else runWaitForMatch(idx, step);
    }
    checkFinished();
    paint();
  }

  function runStep1(step) {
    if (sim.t < sim.retryUntil) { step.note = `รอค้นหาภาชนะเปล่าอีกครั้ง (ครบ 10 วิ ที่ T+${sim.retryUntil}s)`; log(step.note, "warn"); return; }
    sim.linkedChecks += 1;
    let inS = 0, outS = 0;
    if (sim.scenario === "skip") inS = 1;
    if (sim.scenario === "busy" && sim.linkedChecks <= 2) { inS = 1; outS = 1; }
    log(`Step 1: อ่านสถานะคู่ IN/OUT ที่ ${sim.job.steps[0].linkedStockGate.positionKey} → IN=${inS} / OUT=${outS}`);
    if (inS === 1 && outS === 0) {
      step.state = "skipped"; step.note = "IN=1/OUT=0 → ข้าม Step 1";
      sim.steps[1].skipWait = true;
      log("Step 1 ถูกข้าม: ตั้ง Step 2 ให้สร้าง task ได้ทันที โดยใช้ Stock ID ของ OUT ที่พบ", "warn");
      sim.current = 1; sim.steps[1].state = "waiting"; sim.steps[1].note = "พร้อมสร้าง task รอบถัดไป";
      return;
    }
    if (!(inS === 0 && outS === 0)) { step.note = `IN=${inS}/OUT=${outS} ไม่ตรงเงื่อนไข → คง Job ไว้ ตรวจใหม่รอบถัดไป`; log(step.note, "warn"); return; }
    sim.emptySearches += 1;
    const p3 = sim.job.steps[0].emptyContainerPartitionIds;
    if (sim.scenario === "noEmpty" && sim.emptySearches === 1) {
      sim.retryUntil = sim.t + EMPTY_RETRY_MS / 1000;
      step.note = "ไม่พบภาชนะเปล่า (stockStatus=1, ไม่มี taskId) → ลองใหม่หลัง 10 วินาที";
      log(`Step 1: ค้นหาภาชนะเปล่าใน Partition ${p3.join(", ")} → ไม่พบ ลองใหม่หลัง 10 วินาที`, "warn");
      return;
    }
    const container = `CONT-${p3[0]}-${String(Math.floor(Math.random() * 90) + 10)}`;
    log(`Step 1: พบภาชนะเปล่า ${container} ใน Partition ${p3[0]} (stockStatus=1, ไม่มี taskId)`, "ok");
    createTask(0);
    sim.current = 1; sim.steps[1].state = "waiting"; sim.steps[1].note = `รอ ${sim.steps[0].taskId} เป็น STARTED (3)`;
  }

  function runWaitForMatch(idx, step) {
    if (step.skipWait) { step.skipWait = false; createTask(idx); return nextAfter(idx); }
    const ref = sim.steps[idx - 1];
    const refTask = sim.tasks[ref.taskId];
    const expected = idx === 1 ? 3 : 20;
    const expectedText = idx === 1 ? "STARTED (3)" : "status 20";
    if (!refTask || !refTask.visible) {
      step.miss += 1;
      log(`Step ${idx + 1}: ไม่พบ WMS task ${ref.taskId} (ครั้งที่ ${step.miss}/${MISS_LIMIT})`, "warn");
      step.note = `ไม่พบ ${ref.taskId} ${step.miss}/${MISS_LIMIT} รอบ`;
      if (step.miss < MISS_LIMIT) return;
      log(`Step ${idx + 1}: ไม่พบ 3 รอบติดกัน → Backend อนุมานว่า task อ้างอิงจบแล้ว และดำเนินงานต่อ`, "warn");
      ref.state = "done"; ref.note = `${ref.taskId} อนุมานว่าจบ (หายจาก WMS)`;
      createTask(idx); return nextAfter(idx);
    }
    step.miss = 0;
    if ([21, 22, 23].includes(refTask.status)) {
      step.state = "error"; ref.state = "error";
      return fail(`Step ${idx + 1}: task อ้างอิง ${ref.taskId} มี status ${refTask.status} → Job เปลี่ยนเป็น error`);
    }
    if (refTask.status === expected || (expected === 3 && refTask.status === 20)) {
      log(`Step ${idx + 1}: ${ref.taskId} ตรงเงื่อนไข ${expectedText}`, "ok");
      createTask(idx); return nextAfter(idx);
    }
    step.note = `รอ ${ref.taskId} เป็น ${expectedText} (ตอนนี้ ${STATUS_LABEL[refTask.status]})`;
    log(`Step ${idx + 1}: ${step.note}`);
  }

  function nextAfter(idx) {
    sim.current = idx + 1;
    const next = sim.steps[idx + 1];
    if (next) { next.state = "waiting"; next.note = `รอ ${sim.steps[idx].taskId} เป็น ${idx + 1 === 1 ? "STARTED (3)" : "status 20"}`; }
  }

  function checkFinished() {
    if (sim.status !== "running" || sim.current < sim.steps.length) return;
    const last = sim.steps[sim.steps.length - 1];
    const task = sim.tasks[last.taskId];
    if (!task || (task.visible && task.status < 20)) return;
    sim.status = "completed";
    activeQueue.delete(sim.job.jobName);
    const p = sim.product, from = p.location;
    const to = sim.destination === "Manual" ? "OUT (รอนำออก Manual)" : sim.destination;
    log(`✓ Job ${sim.jobId} เสร็จสมบูรณ์: ${from} → ${to}`, "ok");
    stopAuto();
    if (typeof products !== "undefined" && products.includes(p)) {
      p.location = to;
      arrivals.unshift({ ...p, amount: p.qty, time: formatTime(), action: `AGV 3-Step ${from} → ${to}` });
      render();
      showToast("AGV ขนย้ายสำเร็จ", `${p.name} จาก ${from} ไป ${to}`);
    }
  }

  /* ---------- Render ---------- */
  const STATE_TEXT = { pending: "รอคิว", waiting: "รอเงื่อนไข", created: "สร้าง task แล้ว", done: "เสร็จ", skipped: "ข้าม", error: "ผิดพลาด" };
  function paint() {
    if (!sim) return;
    $("#agvItem").textContent = `${sim.product.name} · รหัส ${sim.product.sku} · ต้นทาง ${sim.product.location}`;
    $("#agvJob").textContent = sim.jobId || "—";
    $("#agvJobStatus").textContent = { idle: "ยังไม่ส่ง", running: "running", completed: "completed", error: "error" }[sim.status];
    $("#agvJobStatus").className = `st-${sim.status}`;
    $("#agvRound").textContent = sim.round;
    $("#agvT").textContent = sim.t;
    $("#agvSteps").innerHTML = sim.steps.map((s, i) => `
      <div class="agv-step st-${s.state} ${i === sim.current && sim.status === "running" ? "current" : ""}">
        <div class="agv-step-top"><b>${s.name}</b><span class="badge">${STATE_TEXT[s.state]}</span></div>
        <small>${s.cond}</small><p>${s.note}</p></div>`).join("") +
      (sim.destination === "Manual" ? `<div class="agv-step st-skipped"><div class="agv-step-top"><b>Step 3</b><span class="badge">ไม่มี</span></div><small>เลือก Manual</small><p>ส่งเพียง Step 1 และ Step 2</p></div>` : "");
    $("#agvLog").innerHTML = sim.log.map(l => `<li class="lg-${l.kind}"><time>T+${l.t}s</time> ${l.msg}</li>`).join("");
    $("#agvPayload").textContent = JSON.stringify(sim.job, null, 2);
    const running = sim.status === "running";
    $("#agvStart").disabled = sim.status !== "idle" && !running;
    $("#agvStart").textContent = running ? (timer ? "⏸ หยุดชั่วคราว" : "▶ ทำงานต่อ") : sim.status === "idle" ? "▶ ส่งงาน AGV" : "✓ จบงานแล้ว";
    $("#agvDest").disabled = sim.status !== "idle";
  }

  /* ---------- Timer ---------- */
  function startAuto() {
    stopAuto();
    nextAt = Date.now() + POLL_MS;
    timer = setInterval(() => { nextAt = Date.now() + POLL_MS; pollOnce(); }, POLL_MS);
    countdownTimer = setInterval(updateCountdown, 250);
    updateCountdown(); paint();
  }
  function stopAuto() {
    clearInterval(timer); clearInterval(countdownTimer); timer = countdownTimer = null;
    $("#agvCountdown").textContent = "—";
  }
  function updateCountdown() { $("#agvCountdown").textContent = timer ? `${Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))} วิ` : "—"; }

  /* ---------- Events ---------- */
  function openSim() {
    const product = typeof detailProduct !== "undefined" ? detailProduct : null;
    if (!product) return;
    const srcSelect = document.querySelector("#moveDestination");
    $("#agvDest").innerHTML = [...srcSelect.options].map(o => `<option value="${o.value}">${o.textContent}</option>`).join("") + '<option value="Manual">Manual (ไม่มี Step 3)</option>';
    $("#agvDest").value = srcSelect.value !== product.location ? srcSelect.value : ([...srcSelect.options].find(o => o.value !== product.location)?.value || "Manual");
    if (sim?.product !== product || sim.status !== "running") { sim = newSim(product, $("#agvDest").value, "normal"); }
    paint();
    document.querySelector("#stockDetailModal").classList.remove("active");
    overlay.classList.add("active"); overlay.setAttribute("aria-hidden", "false");
  }
  function closeSim() { overlay.classList.remove("active"); overlay.setAttribute("aria-hidden", "true"); }

  openBtn.addEventListener("click", openSim);
  $("#agvClose").addEventListener("click", closeSim);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeSim(); });
  $("#agvDest").addEventListener("change", () => { if (sim?.status === "idle") { sim = newSim(sim.product, $("#agvDest").value, "normal"); paint(); } });
  $("#agvStart").addEventListener("click", () => {
    if (!sim) return;
    if (sim.status === "idle") {
      if (sim.product.location === sim.destination) { showToast("เลือกตำแหน่งเดิม", "กรุณาเลือกปลายทางอื่น"); return; }
      if (submit()) startAuto();
      paint(); return;
    }
    if (sim.status === "running") { timer ? stopAuto() : startAuto(); paint(); }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSim(); });

  // สำหรับทดสอบ/ดีบักจาก console
  window.AGVSimulator = { open: openSim, pollOnce, get state() { return sim; }, POLL_MS };
})();

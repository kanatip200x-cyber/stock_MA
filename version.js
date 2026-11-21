// ===== เวอร์ชันของเว็บ =====
// version: เลขเวอร์ชันหลัก แก้เองเมื่อมีฟีเจอร์ใหม่ (เช่น "1.2")
// build / date / commit: สคริปต์ tools/auto-push.ps1 อัปเดตให้อัตโนมัติทุกครั้งที่อัปขึ้น GitHub
// changes: สรุปสิ่งที่เปลี่ยนในเวอร์ชันนี้ (แสดงเมื่อกดที่ป้ายเวอร์ชัน)
window.APP_VERSION = {
  version: "1.1",
  build: 8,
  date: "2026-11-21 15:09",
  repo: "https://github.com/kanatip200x-cyber/stock_MA",
  changes: [
    "ล็อกอินด้วย Google ผ่าน Supabase",
    "เก็บสินค้าและประวัติรับเข้า/ขนย้ายในฐานข้อมูล อัปเดตสดทุกเครื่อง",
    "แสดงชื่อผู้ทำรายการ และป้ายเวอร์ชันบนเว็บ",
  ],
};

// แสดงป้ายเวอร์ชันในทุกองค์ประกอบที่มี data-app-version
(function () {
  const v = window.APP_VERSION;
  const label = `v${v.version}.${v.build}`;
  function paint() {
    document.querySelectorAll("[data-app-version]").forEach(el => {
      el.textContent = label;
      el.title = `เวอร์ชัน ${label} · อัปเดต ${v.date} · กดเพื่อดูรายละเอียด`;
      if (el.dataset.versionBound) return;
      el.dataset.versionBound = "1";
      el.addEventListener("click", () => openVersionInfo());
    });
  }
  function openVersionInfo() {
    let box = document.querySelector("#versionInfo");
    if (!box) {
      box = document.createElement("div");
      box.id = "versionInfo";
      box.className = "version-overlay";
      box.innerHTML = `<section class="version-card" role="dialog" aria-modal="true" aria-labelledby="versionTitle">
        <div class="version-head"><h2 id="versionTitle"></h2><button type="button" class="version-close" aria-label="ปิด">✕</button></div>
        <p class="version-meta"></p><ul class="version-changes"></ul>
        <a class="version-link" target="_blank" rel="noopener">ดูประวัติการพัฒนาทั้งหมดบน GitHub →</a></section>`;
      document.body.appendChild(box);
      const close = () => box.classList.remove("active");
      box.addEventListener("click", e => { if (e.target === box || e.target.closest(".version-close")) close(); });
      document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    }
    box.querySelector("#versionTitle").textContent = `เวอร์ชัน ${label}`;
    box.querySelector(".version-meta").textContent = `Build ${v.build} · อัปเดตล่าสุด ${v.date}${v.commit ? ` · commit ${v.commit}` : ""}`;
    const list = box.querySelector(".version-changes");
    list.innerHTML = "";
    (v.changes || []).forEach(text => { const li = document.createElement("li"); li.textContent = text; list.appendChild(li); });
    box.querySelector(".version-link").href = `${v.repo}/commits/main`;
    box.classList.add("active");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
})();

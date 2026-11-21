// ส่งรายการสินค้าเข้า/ออกไปบันทึกใน Google Sheet ผ่าน Google Apps Script Web app
// ถ้ายังไม่ตั้งค่า URL ใน config.js ระบบจะข้ามการส่ง และเว็บยังทำงานได้ตามปกติ
(function () {
  const QUEUE_KEY = "sheetLogQueueV1";
  const MAX_QUEUE = 200;
  const config = window.SHEET_CONFIG || {};

  const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } };
  const writeQueue = queue => localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));

  async function send(entry) {
    // ใช้ text/plain + no-cors เพื่อไม่ให้เบราว์เซอร์ต้องทำ CORS preflight กับ Apps Script
    await fetch(config.sheetWebAppUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...entry, token: config.token || "" }),
    });
  }

  // ส่งรายการที่ค้างอยู่ (เช่น ตอนเน็ตหลุด) ทีละรายการตามลำดับ
  let flushing = false;
  async function flushQueue() {
    if (flushing || !config.sheetWebAppUrl) return;
    flushing = true;
    try {
      let queue = readQueue();
      while (queue.length) {
        await send(queue[0]);
        queue = readQueue().slice(1);
        writeQueue(queue);
      }
    } catch (error) {
      console.warn("[SheetLogger] ส่งข้อมูลไม่สำเร็จ จะลองใหม่ภายหลัง", error);
    } finally {
      flushing = false;
    }
  }

  window.logStockToSheet = function (entry) {
    if (!config.sheetWebAppUrl) return; // ยังไม่ได้ตั้งค่า -> ไม่ส่ง
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    writeQueue([...readQueue(), record]);
    flushQueue();
  };

  window.addEventListener("online", flushQueue);
  setInterval(flushQueue, 30000);
  flushQueue();
})();

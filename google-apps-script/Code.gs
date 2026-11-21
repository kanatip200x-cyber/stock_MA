/**
 * Google Apps Script สำหรับบันทึกสินค้าเข้า/ออก ลง Google Sheet
 * วิธีใช้: เปิด Google Sheet > ส่วนขยาย (Extensions) > Apps Script > วางโค้ดนี้ > Deploy เป็น Web app
 * ดูขั้นตอนเต็มใน README.md
 */

// ต้องตรงกับ token ใน config.js (เว้นว่าง "" ได้ถ้าไม่ต้องการตรวจสอบ)
const SHARED_TOKEN = "";
const SHEET_NAME = "StockLog";
const HEADERS = ["รหัสรายการ", "วันเวลา", "ประเภท", "ชื่อสินค้า", "รหัสวัสดุ", "จำนวน", "ล็อต/แบทช์", "เลขพาเลท", "จาก", "ไปยัง", "หมายเหตุ"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (SHARED_TOKEN && data.token !== SHARED_TOKEN) return json_({ ok: false, error: "invalid token" });
    if (data.type !== "IN" && data.type !== "OUT") return json_({ ok: false, error: "type must be IN or OUT" });

    const sheet = getSheet_();
    // กันบันทึกซ้ำ ถ้ารหัสรายการนี้เคยบันทึกแล้ว
    if (data.id && sheet.getLastRow() > 1) {
      const found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(data.id)).matchEntireCell(true).findNext();
      if (found) return json_({ ok: true, duplicate: true });
    }

    const when = data.timestamp ? new Date(data.timestamp) : new Date();
    sheet.appendRow([
      clean_(data.id),
      when,
      data.type === "IN" ? "รับเข้า" : "ออก",
      clean_(data.name),
      clean_(data.sku),
      Number(data.qty) || 0,
      clean_(data.lot),
      clean_(data.pallet),
      clean_(data.from),
      clean_(data.to),
      clean_(data.note),
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// เปิด URL ของ Web app ในเบราว์เซอร์เพื่อเช็กว่าใช้งานได้
function doGet() {
  return json_({ ok: true, sheet: SHEET_NAME });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#c8102e").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.getRange("B:B").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  }
  return sheet;
}

// ป้องกันสูตรแปลกปลอม (ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกมองเป็นข้อความธรรมดา)
function clean_(value) {
  const text = value === undefined || value === null ? "" : String(value).slice(0, 500);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

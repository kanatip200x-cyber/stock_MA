/**
 * Google Apps Script ของ Google Sheet "สินค้า"
 *  - แท็บ Products : ข้อมูลสินค้าที่เว็บแสดง (เว็บอ่าน/รับเข้า/ขนย้ายผ่านสคริปต์นี้)
 *  - แท็บ StockLog : บันทึกรายการเข้า/ออกทุกครั้ง
 * ติดตั้ง: เปิดชีต "สินค้า" > ส่วนขยาย (Extensions) > Apps Script > วางโค้ดนี้แทนของเดิม > Deploy เป็น Web app
 *         (Execute as: Me, Who has access: Anyone) แล้วนำ URL ที่ลงท้ายด้วย /exec ไปใส่ใน config.js
 *
 * ความปลอดภัย: การอ่าน/แก้สินค้าต้องส่ง access token ของผู้ที่ล็อกอิน Google ผ่าน Supabase มาด้วย
 * สคริปต์จะถาม Supabase ว่า token ถูกต้องไหมก่อนทำงานทุกครั้ง คนที่ไม่ได้ล็อกอินจึงแก้ชีตไม่ได้
 */

// ค่าเดียวกับใน config.js (เป็นค่าสาธารณะ ไม่ใช่รหัสลับ)
const SUPABASE_URL = "https://aohquqhjdehmaaretydh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BH1xUr9B4fvEzkTxx28nAg_NUoFeqog";

const PRODUCTS_SHEET = "Products";
const PRODUCT_HEADERS = ["id", "name", "sku", "qty", "lot", "pallet", "location", "updated_at"];
const LOG_SHEET = "StockLog";
const LOG_HEADERS = ["รหัสรายการ", "วันเวลา", "ประเภท", "ชื่อสินค้า", "รหัสวัสดุ", "จำนวน", "ล็อต/แบทช์", "เลขพาเลท", "จาก", "ไปยัง", "หมายเหตุ", "ผู้ทำรายการ"];

// ===== ทางเข้า =====
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "list") return handle_(() => ({ products: listProducts_(requireUser_(p.access_token)) }));
  return json_({ ok: true, sheet: PRODUCTS_SHEET });
}

function doPost(e) {
  const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  // รูปแบบเดิมของ sheet-logger.js (บันทึกเข้า/ออก) ยังใช้ได้
  if (!data.action && (data.type === "IN" || data.type === "OUT")) {
    return handle_(() => { const user = requireUser_(data.access_token); appendLog_(data, user); return {}; });
  }
  return handle_(() => {
    const user = requireUser_(data.access_token);
    if (data.action === "list") return { products: listProducts_(user) };
    if (data.action === "receive") return { product: receive_(data, user) };
    if (data.action === "move") return { product: move_(data, user) };
    throw new Error("unknown action");
  });
}

// ===== สินค้า =====
function listProducts_() {
  const sheet = productsSheet_();
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, PRODUCT_HEADERS.length).getValues() : [];
  return rows.filter(r => r[0] !== "" && r[1] !== "").map(rowToProduct_).reverse(); // ล่าสุดอยู่บน
}

function receive_(d, user) {
  const qty = Math.floor(Number(d.qty));
  if (!(qty > 0) || qty > 100000) throw new Error("จำนวนไม่ถูกต้อง");
  return withLock_(() => {
    const sheet = productsSheet_();
    const ids = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(r => Number(r[0]) || 0) : [];
    const id = (ids.length ? Math.max.apply(null, ids) : 0) + 1;
    const row = [id, clean_(d.name), clean_(d.sku), qty, clean_(d.lot || "—"), clean_(d.pallet || "—"), clean_(d.location), now_()];
    sheet.appendRow(row);
    appendLog_({ type: "IN", name: d.name, sku: d.sku, qty: qty, lot: d.lot, pallet: d.pallet, from: "", to: d.location, note: d.note }, user);
    return rowToProduct_(row);
  });
}

function move_(d, user) {
  return withLock_(() => {
    const sheet = productsSheet_();
    const r = findRow_(sheet, d.id);
    if (!r) throw new Error("ไม่พบสินค้า");
    const range = sheet.getRange(r, 1, 1, PRODUCT_HEADERS.length);
    const row = range.getValues()[0];
    const from = String(row[6]);
    const to = clean_(d.to);
    if (!to || from === to) throw new Error("ปลายทางไม่ถูกต้อง");
    row[6] = to; row[7] = now_();
    range.setValues([row]);
    appendLog_({ type: "OUT", name: row[1], sku: row[2], qty: row[3], lot: row[4], pallet: row[5], from: from, to: to, note: d.note }, user);
    return rowToProduct_(row);
  });
}

// ===== ตรวจผู้ใช้ผ่าน Supabase =====
function requireUser_(token) {
  if (!token) throw new Error("ต้องล็อกอินก่อน");
  const cache = CacheService.getScriptCache();
  const key = "u_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error("การล็อกอินหมดอายุ กรุณาล็อกอินใหม่");
  const u = JSON.parse(res.getContentText());
  const user = { id: u.id, email: u.email, name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email };
  cache.put(key, JSON.stringify(user), 300);
  return user;
}

// ===== ตัวช่วย =====
function productsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet) sheet = ss.insertSheet(PRODUCTS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(PRODUCT_HEADERS);
    sheet.getRange(1, 1, 1, PRODUCT_HEADERS.length).setFontWeight("bold").setBackground("#c8102e").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) sheet = ss.insertSheet(LOG_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_HEADERS);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight("bold").setBackground("#c8102e").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.getRange("B:B").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  }
  return sheet;
}

function appendLog_(d, user) {
  logSheet_().appendRow([
    clean_(d.id || Utilities.getUuid()), new Date(), d.type === "IN" ? "รับเข้า" : "ขนย้าย/ออก",
    clean_(d.name), clean_(d.sku), Number(d.qty) || 0, clean_(d.lot), clean_(d.pallet),
    clean_(d.from), clean_(d.to), clean_(d.note), clean_(user && (user.name || user.email)),
  ]);
}

function findRow_(sheet, id) {
  if (sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function rowToProduct_(r) {
  return { id: Number(r[0]), name: String(r[1]), sku: String(r[2]), qty: Number(r[3]) || 0, lot: String(r[4] || "—"), pallet: String(r[5] || "—"), location: String(r[6]), updated_at: String(r[7] || "") };
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function handle_(fn) {
  try { return json_(Object.assign({ ok: true }, fn())); }
  catch (err) { return json_({ ok: false, error: String(err && err.message || err) }); }
}

function now_() { return Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm"); }

// ป้องกันสูตรแปลกปลอม (ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกมองเป็นข้อความธรรมดา)
function clean_(value) {
  const text = value === undefined || value === null ? "" : String(value).slice(0, 500);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ===== ตั้งค่า Supabase (ล็อกอินด้วย Google + ฐานข้อมูล) =====
// เอาค่าจาก Supabase Dashboard > Project Settings > API (หรือ Data API)
//   supabaseUrl     = Project URL เช่น "https://abcdefgh.supabase.co"
//   supabaseAnonKey = anon / publishable key (คีย์สาธารณะ ใส่ในหน้าเว็บได้ ปลอดภัยเพราะเปิด RLS ไว้)
// ห้ามใส่ service_role key หรือ secret key ในไฟล์นี้เด็ดขาด
// ถ้าเว้นว่างไว้ เว็บจะทำงานแบบออฟไลน์ (เก็บข้อมูลในเบราว์เซอร์) และไม่ต้องล็อกอิน
window.SUPABASE_CONFIG = {
  supabaseUrl: "https://aohquqhjdehmaaretydh.supabase.co",
  supabaseAnonKey: "sb_publishable_BH1xUr9B4fvEzkTxx28nAg_NUoFeqog",
  // (ไม่บังคับ) จำกัดให้ล็อกอินได้เฉพาะอีเมลโดเมนนี้ เช่น "latto.co.th" เว้นว่าง = Gmail ใดก็ได้
  allowedEmailDomain: "",
  // โหมดผู้เยี่ยมชม: เข้าด้วย PIN ได้โดยไม่ต้องล็อกอิน Google จะเห็นข้อมูลตัวอย่างในเบราว์เซอร์ (ไม่แตะฐานข้อมูลจริง)
  // เก็บเป็นค่า hash ของ PIN (SHA-256 ของ "inventory-demo:" + PIN) เปลี่ยน PIN ได้ด้วยคำสั่งใน README
  guestPinHash: "9937ca04f237ab7ccf8e9c9d0f790864a541172b5e4828681a52360114e2df19",
};

// ===== ตั้งค่าการเชื่อมต่อ Google Sheet =====
// 1) Deploy ไฟล์ google-apps-script/Code.gs เป็น Web app (ดูขั้นตอนใน README.md)
// 2) วาง URL ที่ได้ (ลงท้ายด้วย /exec) ใน sheetWebAppUrl
// 3) ใส่ token ให้ตรงกับ SHARED_TOKEN ใน Code.gs
// หมายเหตุ: ไฟล์นี้อยู่ฝั่งหน้าเว็บ ใครเปิดเว็บก็เห็นค่าในนี้ได้ อย่าใส่รหัสผ่านหรือข้อมูลลับจริง
window.SHEET_CONFIG = {
  sheetWebAppUrl: "",   // เช่น "https://script.google.com/macros/s/XXXX/exec"
  token: "",            // ต้องตรงกับ SHARED_TOKEN ใน Code.gs (เว้นว่างได้ถ้าไม่ใช้)
};

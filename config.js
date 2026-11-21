// ตั้งค่าการเชื่อมต่อ Google Sheet
// 1) Deploy ไฟล์ google-apps-script/Code.gs เป็น Web app (ดูขั้นตอนใน README.md)
// 2) วาง URL ที่ได้ (ลงท้ายด้วย /exec) ใน sheetWebAppUrl
// 3) ใส่ token ให้ตรงกับ SHARED_TOKEN ใน Code.gs
// หมายเหตุ: ไฟล์นี้อยู่ฝั่งหน้าเว็บ ใครเปิดเว็บก็เห็นค่าในนี้ได้ อย่าใส่รหัสผ่านหรือข้อมูลลับจริง
window.SHEET_CONFIG = {
  sheetWebAppUrl: "",   // เช่น "https://script.google.com/macros/s/XXXX/exec"
  token: "",            // ต้องตรงกับ SHARED_TOKEN ใน Code.gs (เว้นว่างได้ถ้าไม่ใช้)
};

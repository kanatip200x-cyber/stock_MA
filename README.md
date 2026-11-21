# Factory Inventory Demo (ธีมแดง-ขาว)

เว็บจำลองระบบสต็อกสินค้า (คลังสินค้า) แบบ HTML/CSS/JavaScript ล้วน ไม่ต้อง build
ทุกครั้งที่มี **สินค้าเข้า** หรือ **สินค้าออก** ระบบจะส่งข้อมูลไปบันทึกใน **Google Sheet** อัตโนมัติ

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าเว็บหลัก (ต้องล็อกอินก่อน เมื่อตั้งค่า Supabase แล้ว) |
| `login.html`, `login.css` | หน้าเข้าสู่ระบบด้วย Google |
| `version.js` | เลขเวอร์ชันที่แสดงบนเว็บ (แก้ `version` และ `changes` เอง ส่วน build/วันที่ สคริปต์ auto-push อัปเดตให้) |
| `auth.js` | เชื่อมต่อ Supabase, ตรวจการล็อกอิน, ออกจากระบบ |
| `supabase/schema.sql` | สร้างตารางฐานข้อมูล + RLS (รันใน Supabase SQL Editor) |
| `styles.css`, `common-style.css` | สไตล์ธีมแดง-ขาว (เปลี่ยนสีได้ที่ตัวแปร `--theme-red` ใน `common-style.css`) |
| `app.js` | ตรรกะหน้าเว็บ (รับสินค้าเข้า, ย้ายสินค้าออก, ตาราง, ค้นหา) |
| `sheet-logger.js` | ส่งรายการเข้า/ออกไปที่ Google Sheet (มีคิวเก็บไว้ส่งใหม่ถ้าเน็ตหลุด) |
| `config.js` | ใส่ค่า Supabase (URL + anon key) และ URL ของ Google Apps Script |
| `google-apps-script/Code.gs` | โค้ดฝั่ง Google Sheet ที่รับข้อมูลแล้วเขียนลงชีต |
| `tools/start-auto-push.bat`, `tools/push-now.bat`, `tools/auto-push.ps1` | อัปโหลดขึ้น GitHub อัตโนมัติ / ครั้งเดียว |

## รายการที่ถูกบันทึกลง Google Sheet

| เหตุการณ์ในเว็บ | ประเภทในชีต |
|---|---|
| กดปุ่ม **+ รับสินค้าเข้า** | รับเข้า |
| รับเข้าอัตโนมัติ (ทุก 60 วินาที ในโหมดจำลอง) | รับเข้า |
| เปิดรายละเอียดสินค้า แล้วกด **จำลองการขนย้าย** | ออก (มีช่อง "จาก" และ "ไปยัง") |

ชีตชื่อ `StockLog` จะถูกสร้างให้อัตโนมัติ มีคอลัมน์: รหัสรายการ, วันเวลา, ประเภท, ชื่อสินค้า, รหัสวัสดุ, จำนวน, ล็อต/แบทช์, เลขพาเลท, จาก, ไปยัง, หมายเหตุ

## ขั้นตอนตั้งค่า Google Sheet

1. สร้าง Google Sheet ใหม่ (ตั้งชื่ออะไรก็ได้ เช่น `Stock Log`)
2. ที่เมนู **ส่วนขยาย (Extensions) > Apps Script**
3. ลบโค้ดเดิม แล้ววางโค้ดทั้งหมดจาก `google-apps-script/Code.gs` แล้วกดบันทึก
4. (แนะนำ) ตั้งค่า `SHARED_TOKEN` ในบรรทัดบนสุดเป็นคำสุ่มๆ เช่น `"stock-2026-abc123"`
5. กด **ทำให้ใช้งานได้ (Deploy) > การทำให้ใช้งานได้รายการใหม่ (New deployment)**
   - ประเภท: **เว็บแอป (Web app)**
   - เรียกใช้ในฐานะ (Execute as): **ฉัน (Me)**
   - ผู้ที่มีสิทธิ์เข้าถึง (Who has access): **ทุกคน (Anyone)**
6. กดอนุญาตสิทธิ์ (Authorize) ตามที่ Google ขอ แล้วคัดลอก **URL ของเว็บแอป** (ลงท้ายด้วย `/exec`)
7. เปิดไฟล์ `config.js` แล้วใส่ค่า

   ```js
   window.SHEET_CONFIG = {
     sheetWebAppUrl: "https://script.google.com/macros/s/xxxxxxxx/exec",
     token: "stock-2026-abc123", // ให้ตรงกับ SHARED_TOKEN
   };
   ```

8. เปิด `index.html` แล้วกด **+ รับสินค้าเข้า** ภายในไม่กี่วินาทีจะเห็นแถวใหม่ในชีต `StockLog`

> ทดสอบว่าเว็บแอปทำงาน: เปิด URL `/exec` ในเบราว์เซอร์ ควรเห็น `{"ok":true,"sheet":"StockLog"}`
>
> ถ้าแก้โค้ดใน Code.gs ภายหลัง ต้อง Deploy ใหม่ โดยเลือก **จัดการการทำให้ใช้งานได้ (Manage deployments) > แก้ไข > เวอร์ชันใหม่** เพื่อให้ URL เดิมใช้ต่อได้

ถ้ายังไม่ใส่ URL ใน `config.js` เว็บจะทำงานได้ตามปกติ แค่จะไม่ส่งข้อมูลไปที่ชีต


## ล็อกอินด้วย Google + ฐานข้อมูล Supabase

เมื่อใส่ค่า Supabase ใน `config.js` แล้ว เว็บจะ
- บังคับให้ล็อกอินด้วยบัญชี Google (Gmail) ที่หน้า `login.html` ก่อนเข้าหน้าหลัก
- เก็บสินค้า, ประวัติรับเข้า/ขนย้าย (พร้อมชื่อคนทำรายการ) และผู้ใช้ ไว้ในฐานข้อมูล Supabase
- อัปเดตตารางสดทุกเครื่องที่เปิดอยู่ (Realtime)
- ถ้ายังไม่ใส่ค่า เว็บทำงานแบบออฟไลน์เหมือนเดิม (เก็บในเบราว์เซอร์ ไม่ต้องล็อกอิน)

ตารางในฐานข้อมูล: `profiles` (ผู้ใช้ + role staff/admin), `locations` (คลัง/พื้นที่ปลายทาง), `products` (สินค้า), `stock_movements` (ประวัติ แก้ไข/ลบไม่ได้)
ทุกตารางเปิด Row Level Security: คนที่ไม่ได้ล็อกอินอ่านหรือเขียนอะไรไม่ได้เลย

### ขั้นที่ 1: สร้างโปรเจกต์ Supabase
1. เข้า https://supabase.com/dashboard แล้วกด **New project**
2. ตั้งชื่อ `inventory-demo`, Region เลือก **Southeast Asia (Singapore)**, ตั้งรหัสผ่านฐานข้อมูล (เก็บไว้เอง ไม่ต้องใส่ในเว็บ) แล้วกด **Create** (แพลน Free ไม่มีค่าใช้จ่าย)
3. รอ 1-2 นาทีจนโปรเจกต์พร้อม

### ขั้นที่ 2: สร้างตาราง
1. ในโปรเจกต์ ไปที่ **SQL Editor > New query**
2. คัดลอกทั้งไฟล์ `supabase/schema.sql` มาวาง แล้วกด **Run** (รันซ้ำได้ ไม่ลบข้อมูลเดิม)

### ขั้นที่ 3: สร้าง Google OAuth Client (ทำใน Google Cloud)
1. ใน Supabase ไปที่ **Authentication > Sign In / Providers > Google** แล้วคัดลอกค่า **Callback URL** (หน้าตา `https://xxxx.supabase.co/auth/v1/callback`)
2. เข้า https://console.cloud.google.com สร้างโปรเจกต์ใหม่ (หรือใช้อันเดิม)
3. ไปที่ **APIs & Services > OAuth consent screen** (หรือ **Google Auth Platform > Branding**)
   - User type: **External** ใส่ชื่อแอป เช่น "คลังสินค้า Demo" และอีเมลติดต่อ แล้วบันทึก
   - ถ้าแอปยังอยู่สถานะ **Testing** ต้องเพิ่มอีเมล Gmail ของคนที่จะใช้ใน **Test users** หรือกด **Publish app** เพื่อให้ Gmail ไหนก็เข้าได้
4. ไปที่ **APIs & Services > Credentials > Create credentials > OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins**: ใส่ที่อยู่เว็บ เช่น `http://localhost:5500` และ/หรือ `https://kanatip200x-cyber.github.io`
   - **Authorized redirect URIs**: วาง **Callback URL** จาก Supabase (ข้อ 1)
   - กด Create แล้วคัดลอก **Client ID** และ **Client secret**
5. กลับไปที่ Supabase **Authentication > Sign In / Providers > Google** เปิด **Enable** แล้ววาง Client ID และ Client secret กด **Save**
   (Client secret ใส่ที่ Supabase เท่านั้น ห้ามใส่ในไฟล์เว็บ)

### ขั้นที่ 4: บอก Supabase ว่าเว็บอยู่ที่ไหน
ไปที่ **Authentication > URL Configuration**
- **Site URL**: ที่อยู่หลักของเว็บ เช่น `https://kanatip200x-cyber.github.io/stock_MA/`
- **Redirect URLs**: เพิ่มทุกที่อยู่ที่จะเปิดเว็บ เช่น `https://kanatip200x-cyber.github.io/stock_MA/**` และ `http://localhost:5500/**`

### ขั้นที่ 5: ใส่ค่าใน config.js
ไปที่ **Project Settings > API Keys** (หรือ Data API) แล้วคัดลอก
- **Project URL** ใส่ใน `supabaseUrl`
- **anon public** หรือ **publishable** key ใส่ใน `supabaseAnonKey`
คีย์นี้เป็นคีย์สาธารณะ อยู่ในหน้าเว็บได้เพราะมี RLS คุ้มครอง **ห้ามใช้ service_role / secret key เด็ดขาด**
ถ้าต้องการให้เฉพาะอีเมลบริษัทเข้าได้ ใส่ `allowedEmailDomain: "latto.co.th"` (ตัวอย่าง)

### ขั้นที่ 6: ทดสอบ
- การล็อกอิน Google **ใช้กับการเปิดไฟล์ตรง ๆ (file://) ไม่ได้** ต้องเปิดผ่านเว็บเซิร์ฟเวอร์ เช่น
  - VS Code ติดตั้ง Live Server แล้วคลิกขวา `index.html` > Open with Live Server (ได้ `http://127.0.0.1:5500`) หรือ
  - ใช้ GitHub Pages
- เปิด `login.html` กด **เข้าสู่ระบบด้วย Google** เลือกบัญชี แล้วจะกลับมาหน้าหลักพร้อมชื่อและรูปของคุณมุมขวาบน

### ตั้งตัวเองเป็นแอดมิน (ไม่บังคับ)
หลังล็อกอินครั้งแรก ไปที่ SQL Editor แล้วรัน
```sql
update public.profiles set role = 'admin' where email = 'อีเมลของคุณ@gmail.com';
```
แอดมินลบสินค้าและแก้รายการคลัง/พื้นที่ (`locations`) ได้ พนักงานทั่วไป (staff) รับเข้าและขนย้ายได้

## เลขเวอร์ชันบนเว็บ

มุมบนของหน้าหลักและท้ายหน้าล็อกอินจะแสดงป้าย เช่น `v1.1.12` กดที่ป้ายเพื่อดูว่าเวอร์ชันนี้มีอะไรใหม่ และลิงก์ไปดูประวัติบน GitHub
- `1.1` = เวอร์ชันหลัก แก้เองใน `version.js` เมื่อเพิ่มฟีเจอร์ใหม่ (พร้อมเขียนสรุปใน `changes`)
- `.12` = เลข build เพิ่มขึ้นเองทุกครั้งที่ `tools/start-auto-push.bat` หรือ `tools/push-now.bat` อัปขึ้น GitHub (เท่ากับจำนวน commit)

## เปิดใช้งานเว็บ

- เปิดไฟล์ `index.html` ด้วยเบราว์เซอร์ได้โดยตรง หรือ
- ขึ้น **GitHub Pages**: push ไฟล์ทั้งหมดขึ้น GitHub แล้วไปที่ **Settings > Pages > Source: Deploy from a branch > `main` / root**

## อัปขึ้น GitHub อัตโนมัติ (Windows)

มีสคริปต์ในโฟลเดอร์ `tools/` ให้ใช้ (ต้องติดตั้ง [Git for Windows](https://git-scm.com/download/win) ก่อน)

1. สร้าง repo เปล่าบน GitHub (แนะนำให้ตั้งเป็น **Private** เพราะ `config.js` มี URL ของ Google Sheet) โดยไม่ต้องติ๊กสร้าง README
2. ดับเบิลคลิก `tools/start-auto-push.bat`
3. ครั้งแรกจะถาม URL ของ repo ให้วาง เช่น `https://github.com/<ชื่อผู้ใช้>/<ชื่อ-repo>.git` และจะมีหน้าต่างให้ล็อกอิน GitHub
4. ปล่อยหน้าต่างนี้เปิดไว้ ทุกครั้งที่แก้ไฟล์แล้วบันทึก ระบบจะรอ 15 วินาทีแล้ว commit + push ขึ้น GitHub ให้เอง ปิดหน้าต่างเพื่อหยุด

ถ้าอยากอัปเฉพาะตอนที่ต้องการ ให้ดับเบิลคลิก `tools/push-now.bat` แทน (อัปครั้งเดียวแล้วจบ)

## นำขึ้น GitHub (แบบพิมพ์คำสั่งเอง)

```bash
git init
git add .
git commit -m "Inventory demo: red-white theme + Google Sheet logging"
git branch -M main
git remote add origin https://github.com/<ชื่อผู้ใช้>/<ชื่อ-repo>.git
git push -u origin main
```

## ข้อควรระวังด้านความปลอดภัย

- `config.js` เป็นไฟล์ฝั่งหน้าเว็บ ใครเปิดเว็บหรือดู repo ก็เห็น URL และ token ได้ token จึงช่วยกันคนสุ่มยิงข้อมูลได้ระดับหนึ่งเท่านั้น ไม่ใช่รหัสผ่านจริง
- ถ้า repo เป็น public และไม่อยากให้คนอื่นเขียนลงชีตได้ ให้ตั้ง repo เป็น private หรือเว้น `sheetWebAppUrl` ว่างไว้ใน GitHub แล้วใส่เฉพาะในเครื่องที่ใช้งานจริง
- สคริปต์ป้องกันข้อความที่ขึ้นต้นด้วย `=`, `+`, `-`, `@` ไม่ให้ถูกตีความเป็นสูตรในชีต และกันบันทึกซ้ำด้วยรหัสรายการ

## หมายเหตุ

- ข้อมูลสต็อกในหน้าเว็บเก็บใน `localStorage` ของเบราว์เซอร์ (เป็นข้อมูลจำลอง) ส่วน Google Sheet เป็นบันทึกประวัติการเข้า/ออก
- ถ้าเน็ตหลุด รายการจะถูกเก็บในคิวและส่งใหม่อัตโนมัติทุก 30 วินาที หรือเมื่อกลับมาออนไลน์

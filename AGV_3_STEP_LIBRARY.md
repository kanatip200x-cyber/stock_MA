# AGV 3-Step Stock Move

เอกสารนี้อธิบายการเรียกรถเพื่อย้ายสินค้าจากตำแหน่งสต็อก ผ่านตำแหน่ง IN/OUT
ที่จับคู่กัน แล้วส่งต่อไปยังปลายทางที่เลือก โดยอ้างอิงการทำงานปัจจุบันใน
`stock-data.html` และ `factory-backend/Service/agvService.js`

## ภาพรวม

1. ผู้ใช้เปิดรายละเอียดสินค้า เลือกปลายทาง และยืนยันการย้าย
2. หน้าเว็บตรวจสถานะสินค้าและคิวงาน จากนั้นหา stock ตำแหน่ง IN/OUT
   ที่ตรงกับตำแหน่งซึ่งจับคู่ไว้
3. หน้าเว็บส่ง Job พร้อมลำดับ Steps ไปยัง Backend
4. Backend เพิ่ม Job เข้าคิว แล้วตรวจเงื่อนไขและสร้าง WMS task ทีละ Step
5. ถ้าเลือกปลายทางจริง จะมี 3 Steps; ถ้าเลือก `Manual` จะไม่มี Step 3

การส่ง Job เข้าคิวสำเร็จไม่ได้หมายความว่ารถเริ่มทำงานทันที Backend จะประมวลผล
คิวเป็นรอบ และรอให้เงื่อนไขของแต่ละ Step ผ่านก่อนส่ง task ถัดไป

## ก่อนส่งงาน

- สินค้าที่เลือกต้องมี `stockStatus=2` เมื่ออ่านสถานะล่าสุดจาก WMS
- สินค้าต้องไม่อยู่ใน active AGV three-step queue
- ต้องพบ Link Partitions และตำแหน่งในคู่ IN/OUT ที่ตรงกัน โดยเทียบ
  `stockLayer`, `stockRow`, `stockColumn`
- ผู้ใช้ต้องเลือกปลายทางจากข้อมูล Partition Relation หรือเลือก `Manual`
- Partition 3 ที่บันทึกไว้ใช้เป็นลำดับค้นหาภาชนะเปล่า หากยังไม่มีรายการที่บันทึก
  ระบบใช้ Partition `5` เป็น fallback

หน้าเว็บตรวจสถานะสินค้าและคิวอีกครั้งเมื่อยืนยันงาน ส่วน Backend ตรวจสถานะ
IN/OUT และภาชนะเปล่าซ้ำก่อนสร้าง task ที่เกี่ยวข้อง

## ลำดับงาน

| Step | เส้นทางและงาน | เงื่อนไขในคิว | การทำงานของ Backend |
|---|---|---|---|
| 1 | Partition 3 → IN, task type 6 | `WAIT_FOR_LINKED_STOCK` | ตรวจสถานะตำแหน่ง IN/OUT หาก IN และ OUT ว่าง (`0/0`) จะค้นหาภาชนะเปล่าที่ไม่ถูกจองใน Partition 3 ตามลำดับ แล้วสร้าง task |
| 2 | ตำแหน่งสินค้าต้นทาง → OUT, task type 1 | `WAIT_FOR_WMS_MATCH`, รอ `STARTED` | รอ WMS task ของ Step 1 ที่ตรงกับเงื่อนไข แล้วสร้าง task ย้ายสินค้าลงภาชนะและนำไป OUT |
| 3 | OUT → ปลายทางที่เลือก, task type 1 | `WAIT_FOR_WMS_MATCH`, รอ status `20` | รอ WMS task ของ Step 2 เสร็จ แล้วสร้าง task ส่งภาชนะ/สินค้าไปปลายทาง |

### รายละเอียด Step 1

`linkedStockGate` ระบุ Partition IN, Partition OUT และ `positionKey` ของตำแหน่ง
ที่จับคู่กัน Backend อ่าน stock ของทั้งสอง Partition แล้วหาตำแหน่งตาม key ดังกล่าว

- ถ้า IN=`0` และ OUT=`0`: ค้นหา stock ที่ `stockStatus=1` และไม่มี `taskId`
  ใน Partition 3 ที่กำหนดไว้ หากยังไม่พบ จะลองใหม่หลัง 10 วินาที
- ถ้า IN=`1` และ OUT=`0`: ข้าม Step 1 และตั้ง Step 2 ให้สร้าง task ได้ทันที
  โดยใช้ Stock ID ของ OUT ที่พบ
- สถานะคู่อื่น: คง Job ไว้รอเงื่อนไข แล้วตรวจใหม่ในรอบถัดไป

เมื่อพบภาชนะเปล่า Backend กำหนด Partition ต้นทางของ Step 1 จาก Partition 3
ที่พบ และกำหนด Stock ID ปลายทางเป็นตำแหน่ง IN ที่จับคู่ไว้

### รายละเอียด Step 2 และ Step 3

Step 2 รอ task ที่ตรงกับ task type, ตำแหน่งเริ่ม/ปลายทาง และ Stock ID ปลายทาง
ของ Step 1 จน WMS แสดงสถานะเริ่มทำงาน (`STARTED`, status `3`) แล้วจึงสร้าง
task ของ Step 2

ถ้าเลือกปลายทางจริง Step 3 จะรอ task ของ Step 2 ที่ตรงกับ Stock ID ปลายทาง
จน WMS status เป็น `20`
ก่อนสร้าง task ปลายทาง ถ้าเลือก `Manual` จะส่งเพียง Step 1 และ Step 2

หาก WMS task ที่กำลังรอไม่พบติดต่อกัน 3 รอบ Backend ปัจจุบันจะอนุมานว่า
task อ้างอิงจบแล้วและดำเนินงานต่อ ควรคำนึงถึงพฤติกรรมนี้เมื่อตรวจสอบงานที่หาย
จากรายการ WMS

## รูปแบบ Job

หน้าเว็บส่งข้อมูลผ่าน `submitAGVJob(jobName, steps)` ไปที่
`POST /api/agv/submit-job` รูปแบบต่อไปนี้เป็นโครงสร้างอ้างอิงเท่านั้น
ค่าใน `<...>` เป็น placeholder และไม่ใช่ payload ที่ส่งได้ทันที:

```json
{
  "jobName": "<job_name>",
  "steps": [
    {
      "stepName": "<step_1_name>",
      "executeCondition": "WAIT_FOR_LINKED_STOCK",
      "emptyContainerPartitionIds": ["<partition_3_id>"],
      "linkedStockGate": {
        "inPartitionId": "<in_partition_id>",
        "outPartitionId": "<out_partition_id>",
        "positionKey": "<stock_layer>|<stock_row>|<stock_column>"
      },
      "payload": {
        "taskType": "<phase_1_task_type>",
        "startPartitionId": "<partition_3_id>",
        "endPartitionId": "<in_partition_id>",
        "endStockId": "<in_stock_id>",
        "inboundMaterialDetail": ["<selected_inventory_item>"]
      }
    },
    {
      "stepName": "<step_2_name>",
      "executeCondition": "WAIT_FOR_WMS_MATCH",
      "waitForMatch": {
        "taskType": "<phase_1_task_type>",
        "startPartitionId": "<partition_3_id>",
        "endPartitionId": "<in_partition_id>",
        "endStockId": "<in_stock_id>"
      },
      "expectedStatus": "STARTED",
      "payload": {
        "taskType": "<phase_2_task_type>",
        "startPartitionId": "<stock_partition_id>",
        "startStockId": "<selected_stock_id>",
        "endPartitionId": "<out_partition_id>",
        "endStockId": "<out_stock_id>"
      }
    },
    {
      "stepName": "<step_3_name>",
      "executeCondition": "WAIT_FOR_WMS_MATCH",
      "waitForMatch": {
        "taskType": "<phase_2_task_type>",
        "startPartitionId": "<stock_partition_id>",
        "endPartitionId": "<out_partition_id>",
        "endStockId": "<out_stock_id>"
      },
      "expectedStatus": 20,
      "payload": {
        "taskType": "<phase_3_task_type>",
        "startPartitionId": "<out_partition_id>",
        "startStockId": "<out_stock_id>",
        "endPartitionId": "<destination_partition_id>",
        "endStockId": ""
      }
    }
  ],
  "token": "<WMS_ACCESS_TOKEN>"
}
```

Payload ของแต่ละ WMS task ยังมีฟิลด์ตั้งค่าร่วม เช่น `agv`, `agvType`,
`priority`, `autoRest`, `containerTypeCode`, `processId`, `taskName`,
`taskPath`, `taskStatus` และ `taskTemplate` โดยค่าปริยายที่กำหนดในหน้าเว็บคือ:

| ค่า | Step 1 | Step 2 | Step 3 |
|---|---:|---:|---:|
| `taskType` | 6 | 1 | 1 |
| `agvType` | 2 | 7 | 2 |
| `priority` | 61 | 61 | 61 |

ค่าเหล่านี้เป็น default ของ `window.AGV_CONFIG` และสามารถเปลี่ยนได้จาก config
ที่หน้าเว็บกำหนดไว้

## Backend และการติดตาม

- `POST /api/agv/submit-job` เพิ่ม Job สถานะ `running` เข้าคิวและตอบ HTTP 202
  พร้อม Job ID เมื่อรับงานสำเร็จ
- Worker ใน `factory-backend/Service/agvService.js` ตรวจคิวทุก 5 วินาที
- WMS task สร้างผ่าน `POST /admin-api/transaction/task/create`
- สำหรับ `WAIT_FOR_WMS_MATCH` Backend จับคู่ task จาก task type และ
  Partition ต้นทาง/ปลายทางที่กำหนด หาก task ที่พบมี status `21`, `22` หรือ `23`
  Job จะเปลี่ยนเป็น error
- ตรวจสถานะคิวและข้อความล่าสุดได้จาก `GET /api/agv/queue`
- งานแบบย้ายทั้ง Lot ตรวจ Stock ID และสถานะของสมาชิกใน Lot ก่อน จากนั้นส่ง
  Job แยกเป็นรายสินค้าแบบเรียงลำดับ

## Source references

- [stock-data.html](../stock-data.html) — popup, preflight, สร้าง Steps และส่ง Job
- [agv-service.js](../factory-backend/agv-service.js) — ส่ง Job จากหน้าเว็บไป Backend
- [Service/agvService.js](../factory-backend/Service/agvService.js) — รับ Job,
  worker, เงื่อนไขการจับคู่ WMS task และสร้าง task
- [new_server.js](../factory-backend/new_server.js) — ลงทะเบียน AGV service
- [AGV_TASK_STATUS_LIBRARY.md](./AGV_TASK_STATUS_LIBRARY.md) — ความหมายของสถานะ WMS
- [WMS_STOCK_STATUS_LIBRARY.md](./WMS_STOCK_STATUS_LIBRARY.md) — เงื่อนไข Stock status

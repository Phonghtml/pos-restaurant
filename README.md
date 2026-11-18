# POS ຮ້ານອາຫານ

ລະບົບ POS ສຳລັບຮ້ານອາຫານ 1 ສາຂາ (ຮອງຮັບຫຼາຍສາຂາໃນອະນາຄົດ).
ໃຊ້ codebase ດຽວກັນສຳລັບເວັບ, ມືຖື/tablet (PWA) ແລະ desktop, ເຮັດວຽກ offline ໄດ້ແລ້ວ sync ເມື່ອອອນລາຍ.

## ໂຄງສ້າງໂປຣເຈັກ

```
pos-restaurant/
├── apps/
│   ├── web/          React + TypeScript + Vite (PWA, Dexie.js ສຳລັບ offline)
│   └── api/          Node.js + TypeScript (Express), PostgreSQL
├── packages/
│   └── shared/       Types ແລະ schema ທີ່ໃຊ້ຮ່ວມກັນ front/back
├── db/
│   ├── schema.sql    ໂຄງສ້າງຖານຂໍ້ມູນ PostgreSQL
│   └── seed.sql      ຂໍ້ມູນເມນູເບື້ອງຕົ້ນ
└── README.md
```

## ຂັ້ນຕອນ Phase 0 (ປະມານ 1 ອາທິດ)

- [x] ໂຄງສ້າງໂປຣເຈັກ
- [x] ອອກແບບຖານຂໍ້ມູນເບື້ອງຕົ້ນ (`db/schema.sql`)
- [x] ໃສ່ຂໍ້ມູນເມນູເບື້ອງຕົ້ນ (`db/seed.sql`)
- [x] ກຳນົດລາຄາເມນູ
- [x] ເລືອກ Express ສຳລັບ backend
- [ ] ເລກປະຈຳຕົວຜູ້ເສຍພາສີ: ຍັງບໍ່ມີ, ຂ້າມໄປກ່ອນ (ເກັບໄວ້ທີ່ `branches.tax_id` ແລ້ວ, ເພີ່ມພາຍຫຼັງ)
- [x] ຕັ້ງຄ່າ PostgreSQL ແລະ ທົດສອບ schema (ຮັນ `schema.sql` ແລະ `seed.sql` ສຳເລັດໃນ PostgreSQL 16, ເມນູ 7 ລາຍການ)

## ເງື່ອນໄຂທີ່ຮູ້ແລ້ວ

- ເຄື່ອງພິມໃບບິນ/ຄົວ: ຍັງບໍ່ມີ, ຂ້າມໄປກ່ອນ
- QR ຊຳລະ: BCEL One ແລະ LDB, ບັນທຶກຜົນດ້ວຍມືໃນໄລຍະ 1
- ອຸປະກອນ: tablet, ມືຖື ແລະ PC
- ບໍ່ມີ VAT (ຍອດ = ລາຄາເມນູລວມ)

## Phase 1: API ບິນ/ໂຕະ (ສຳເລັດແລ້ວ)

| Method | Path | ໜ້າທີ່ |
| --- | --- | --- |
| GET | `/api/health` | ກວດວ່າ server ເຮັດວຽກ |
| GET | `/api/menu?branchId=` | ເມນູ, ລາຄາ, ຕົວເລືອກ |
| GET | `/api/orders/tables?branchId=` | ສະຖານະໂຕະ (free / occupied) |
| POST | `/api/orders` | ເປີດບິນໃຫ້ໂຕະ (ຖ້າມີແລ້ວຈະສົ່ງບິນເກົ່າ) |
| GET | `/api/orders/:id` | ບິນພ້ອມລາຍການ ແລະ ຍອດ |
| POST | `/api/orders/:id/items` | ເພີ່ມລາຍການ (ລາຄາດຶງຈາກ DB, ກວດຕົວເລືອກບັງຄັບ) |
| DELETE | `/api/orders/:id/items/:itemId` | ລຶບລາຍການ (ໄດ້ສະເພາະບິນເປີດ) |
| POST | `/api/orders/:id/payments` | ຊຳລະ (cash/qr/card), ຮອງຮັບແບ່ງຈ່າຍ, ປິດບິນອັດຕະໂນມັດເມື່ອຈ່າຍຄົບ |
| GET | `/api/orders/:id/payments` | ລາຍການການຊຳລະຂອງບິນ |

**ຂໍ້ທີ່ຕ້ອງຢືນຢັນ / ຍັງບໍ່ເຮັດ**
- ຍັງບໍ່ມີ authentication: `staffId` ສົ່ງມາໃນ body ເອງ ຕ້ອງເພີ່ມ login/token ກ່ອນນຳໃຊ້ຈິງ
- ພະນັກງານ seed (`admin`) ໃຊ້ password placeholder ເທົ່ານັ້ນ
- ການຊຳລະ: QR ແລະ ບັດ ບັງຄັບໃສ່ເລກອ້າງອີງ, ເງິນສົດສາມາດໃສ່ `tenderedLak` ເພື່ອຄິດເງິນທອນ, ຈ່າຍເກີນຍອດຄົງເຫຼືອບໍ່ໄດ້
- ຍັງບໍ່ມີ: ຍ້າຍ/ລວມໂຕະ, ອັບເດດຈຳນວນ, ສົ່ງອໍເດີໄປຄົວ, ຍົກເລີກບິນ (void)

## ບັນຊີຮັບເງິນ QR/ໂອນ (ຂໍ້ 1)

- ເກັບໃນຕາຕະລາງ `branches`: `payment_bank`, `payment_account_no`, `payment_account_name` (ບໍ່ມີໃນ seed)
- ຕັ້ງຄ່າໃນເຄື່ອງຂອງຮ້ານດ້ວຍ SQL ດ້ວຍຕົນເອງ ບໍ່ commit ເລກບັນຊີລົງໄຟລ໌ໂປຣເຈັກ:
  ```sql
  UPDATE branches
  SET payment_bank = '<ທະນາຄານ>',
      payment_account_no = '<ເລກບັນຊີ>',
      payment_account_name = '<ຊື່ບັນຊີ>'
  WHERE id = '00000000-0000-0000-0000-000000000001';
  ```
- `GET /api/branches/:id/payment-account` ສົ່ງຂໍ້ມູນນີ້ກັບ (ຕ້ອງເພີ່ມ auth ກ່ອນໃຊ້ຈິງ)
- ເລກອ້າງອີງການຊຳລະ QR/ບັດ ຍັງເປັນເລກຂອງແຕ່ລະລາຍການ ບໍ່ແມ່ນເລກບັນຊີນີ້

## ສົ່ງອໍເດີໄປຄົວ (ຂໍ້ 3)

| Method | Path | ໜ້າທີ່ |
| --- | --- | --- |
| POST | `/api/orders/:id/send-to-kitchen` | ສົ່ງລາຍການທີ່ຍັງບໍ່ເຄີຍສົ່ງ (ບໍ່ສົ່ງຊ້ຳ) |
| GET | `/api/kitchen/tickets?branchId=` | ລາຍການທີ່ຍັງບໍ່ເສີບ ສຳລັບໜ້າຈໍຄົວ |
| PATCH | `/api/kitchen/items/:itemId` | ປ່ຽນສະຖານະ `cooking` → `ready` → `served` (ຂ້າມຂັ້ນບໍ່ໄດ້) |

- ລາຍການທີ່ສົ່ງໄປຄົວແລ້ວ ລຶບບໍ່ໄດ້ (409)
- ໜ້າຈໍຄົວຕ້ອງດຶງ `/api/kitchen/tickets` ເປັນໄລຍະ (polling). ຍັງບໍ່ມີ realtime
- ຍັງບໍ່ມີການພິມໃບຄົວ ເພາະຍັງບໍ່ມີເຄື່ອງພິມ

## ໜ້າ UI (ຂໍ້ 4, `apps/web`)

- ໜ້າ **ໂຕະ**: ເລືອກໂຕະ, ເປີດບິນ, ສະຖານະ ວ່າງ/ມີລູກຄ້າ (ອັບເດດທຸກ 5 ວິນາທີ)
- ໜ້າ **ບິນ**: ເລືອກເມນູ, ເລືອກຕົວເລືອກ (ຊະນິດຊີ້ນ), ລຶບລາຍການທີ່ຍັງບໍ່ສົ່ງຄົວ, ສົ່ງໄປຄົວ, ຊຳລະ (ເງິນສົດ/QR/ບັດ)
- ໜ້າ **ຄົວ**: ລາຍການລໍຖ້າ/ກຳລັງເຮັດ/ສຳເລັດ ດ້ວຍປຸ່ມປ່ຽນສະຖານະ (ອັບເດດທຸກ 3 ວິນາທີ)

**ຮັນໃນເຄື່ອງ**
```bash
# Terminal 1: API (ພອດ 3100)
cd apps/api && DATABASE_URL=postgres://... PORT=3100 npm run dev
# Terminal 2: ໜ້າເວັບ (ພອດ 5173, proxy /api ໄປ 3100)
cd apps/web && npm run dev
```

**ຍັງບໍ່ມີ**
- Realtime: ໜ້າຈໍຄົວ ແລະ ໂຕະ ໃຊ້ polling

## Login ແລະ ສິດ (ຂໍ້ 1 ຂອງ "ຂັ້ນຕໍ່ໄປ")

- `POST /api/auth/login` → `{ token, user }`. ທຸກ endpoint (ຍົກເວັ້ນ health/login) ຕ້ອງສົ່ງ `Authorization: Bearer <token>`
- ລະຫັດຜ່ານເກັບເປັນ scrypt hash. Token ເປັນ HMAC-SHA256 ໝົດອາຍຸ 12 ຊົ່ວໂມງ
- ຕ້ອງຕັ້ງ `AUTH_SECRET` (ຢ່າ commit). ຕັ້ງລະຫັດຜ່ານດ້ວຍ:
  `npx tsx src/scripts/set-staff-password.ts <username> "<password>"`
- ສິດ:
  - admin: ທຸກຢ່າງ ລວມລາຍງານ
  - cashier: ເປີດໂຕະ, ສັ່ງ, ສົ່ງຄົວ, ຊຳລະ, ເບິ່ງ payment account
  - waiter: ເປີດໂຕະ, ສັ່ງ, ສົ່ງຄົວ
  - kitchen: ໜ້າຈໍຄົວ ເທົ່ານັ້ນ
- `branchId` ມາຈາກ token ທັງໝົດ ບໍ່ຮັບຈາກ client
- `POST /api/auth/logout` (client ລຶບ token ເອງ)

## ລາຍງານ (ຂໍ້ 3)

- `GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` (admin): ຈຳນວນບິນ, ຍອດລວມ, ແຍກຕາມວິທີຊຳລະ, ເມນູຂາຍດີ 10 ອັນດັບ
- ນັບວັນຕາມເວລາລາວ (Asia/Vientiane)
- ໜ້າ "ລາຍງານ" ໃນເວັບ ສຳລັບ admin

## ອອບລາຍ / sync (ຂໍ້ 2)

- ເວັບເກັບຂໍ້ມູນໃນ IndexedDB (Dexie): cache ເມນູ, ໂຕະ, ບິນ ແລະ outbox ຂອງເຫດການ
- ການເປີດໂຕະ, ເພີ່ມ/ລຶບລາຍການ, ສົ່ງຄົວ, ຊຳລະ ຖືກບັນທຶກເປັນເຫດການໃນ outbox ກ່ອນ ແລ້ວສົ່ງຂຶ້ນ server
- `POST /api/sync` ຮັບເຫດການເປັນຊຸດ, apply ຕາມລຳດັບ, ກັນການ apply ຊ້ຳດ້ວຍ `client_uuid` (`sync_events`)
- ID ຂອງບິນ/ລາຍການ/ການຊຳລະ ສ້າງໂດຍເຄື່ອງ (UUID) ເພື່ອໃຫ້ອອບລາຍໄດ້
- ເຫດການທີ່ server ປະຕິເສດ (ເຊັ່ນ ໂຕະມີບິນແລ້ວ, ຈ່າຍເກີນ) ຈະຂຶ້ນສະແດງໃນແຖບສະຖານະ ໃຫ້ພະນັກງານລຶບເອງ
- ໜ້າຈໍຄົວຕ້ອງອອນລາຍ (ບໍ່ອອບລາຍ)
- Service worker (vite-plugin-pwa) ເກັບໄຟລ໌ໜ້າເວັບໄວ້ເປີດໄດ້ແມ່ນຕອນອອບລາຍ

**ຂໍ້ຈຳກັດທີ່ຮູ້ແລ້ວ**
- ຖ້າສອງເຄື່ອງເປີດບິນໃຫ້ໂຕະດຽວກັນຕອນອອບລາຍ ເຄື່ອງທີ່ sync ທີ່ 2 ຈະຖືກປະຕິເສດ
- ຍັງບໍ່ໄດ້ທົດສອບບ່ອນທີ່ເປີດໜ້າເວັບ "ເລີ່ມຈາກ 0" ໃນອອບລາຍ (ຕ້ອງເຄີຍເປີດອອນລາຍກ່ອນ)
- ການທົດສອບ E2E ໃຊ້ Playwright + Chrome ໃນເຄື່ອງ: ອອນລາຍ → ອອບລາຍ → ເພີ່ມລາຍການ → ກັບມາອອນລາຍ → sync ຜ່ານ ແລ້ວ server ມີລາຍການຄົບ

## ຮູບເມນູ ແລະ ຕົວເລືອກເຝີ (migration 002)

- ຖານຂໍ້ມູນທີ່ມີຢູ່ແລ້ວ: ຮັນ `db/migrations/002_menu_images_options.sql` 1 ຄັ້ງ (ຮັນຊ້ຳໄດ້ປອດໄພ)
- ຖານຂໍ້ມູນໃໝ່: `schema.sql` → `seed.sql` → `migrations/002_menu_images_options.sql`
- `menu_items.image_url` ເກັບເສັ້ນທາງຮູບ ເຊັ່ນ `/menu/ເຂົ້າປຽກໝູ່.jpg` ວາງໄຟລ໌ໄວ້ທີ່ `apps/web/public/menu/`
- ທຸກເມນູອາຫານມີກຸ່ມ "ເລືອກຊະນິດຊີ້ນ" (ໝູ່ / ໄກ່ / ເປັດ / ຊີ້ນງົວ, ເພີ່ມ 0 ກີບ). ນ້ຳດື່ມບໍ່ມີ

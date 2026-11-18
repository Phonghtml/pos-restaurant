-- POS ຮ້ານອາຫານ: schema ເບື້ອງຕົ້ນ (PostgreSQL)
-- ອອກແບບໃຫ້ຮອງຮັບຫຼາຍສາຂາ (branch_id) ແລະ sync offline (id ເປັນ UUID ທີ່ສ້າງໃນເຄື່ອງ)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ສາຂາ
CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT,
  tax_id      TEXT,                       -- ເລກປະຈຳຕົວຜູ້ເສຍພາສີ (ຍັງຢືນຢັນ)
  -- ບັນຊີຮັບເງິນ QR/ໂອນ: ບໍ່ເກັບໃນ seed ທີ່ commit ແລ້ວ, ໃສ່ດ້ວຍ UPDATE ໃນເຄື່ອງຂອງຮ້ານເອງ
  payment_bank          TEXT,
  payment_account_no    TEXT,
  payment_account_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ພະນັກງານ ແລະ ສິດ
CREATE TABLE staff (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES branches(id),
  name         TEXT NOT NULL,
  username     TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'kitchen', 'waiter')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ໝວດໝູ່ເມນູ
CREATE TABLE menu_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES branches(id),
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0
);

-- ເມນູ
CREATE TABLE menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES branches(id),
  category_id   UUID NOT NULL REFERENCES menu_categories(id),
  name          TEXT NOT NULL,
  price_lak     NUMERIC(12,0),            -- NULL = ຍັງບໍ່ໄດ້ກຳນົດລາຄາ
  is_signature  BOOLEAN NOT NULL DEFAULT false,
  image_url     TEXT,                     -- ເສັ້ນທາງຮູບ ເຊັ່ນ /menu/ເຂົ້າປຽກໝູ່.jpg (NULL = ໃຊ້ຕົວອັກສອນແທນ)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ກຸ່ມຕົວເລືອກ (ເຊັ່ນ: ປະເພດຊີ້ນຂອງເຝີ)
CREATE TABLE menu_option_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_required   BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE menu_options (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_group_id  UUID NOT NULL REFERENCES menu_option_groups(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  extra_price_lak  NUMERIC(12,0) NOT NULL DEFAULT 0,
  sort_order       INT NOT NULL DEFAULT 0
);

-- ໂຊນ ແລະ ໂຕະ/ຫ້ອງ
CREATE TABLE zones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID NOT NULL REFERENCES branches(id),
  name       TEXT NOT NULL
);

CREATE TABLE tables (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID NOT NULL REFERENCES branches(id),
  zone_id    UUID REFERENCES zones(id),
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'reserved'))
);

-- ບິນ/ອໍເດີ
CREATE TABLE orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES branches(id),
  table_id     UUID REFERENCES tables(id),
  opened_by    UUID NOT NULL REFERENCES staff(id),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void')),
  subtotal_lak NUMERIC(12,0) NOT NULL DEFAULT 0,
  total_lak    NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at      TIMESTAMPTZ,
  device_id    TEXT,                     -- ເຄື່ອງທີ່ສ້າງບິນ (ສຳລັບ sync)
  client_uuid  UUID UNIQUE               -- ID ທີ່ສ້າງໃນເຄື່ອງ, ປ້ອງກັນບັນທຶກຊ້ຳ
);

CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id  UUID NOT NULL REFERENCES menu_items(id),
  name_snapshot TEXT NOT NULL,            -- ຊື່ ແລະ ລາຄາ ຕອນສັ່ງ (ປ່ຽນລາຄາພາຍຫຼັງບໍ່ກະທົບບິນເກົ່າ)
  unit_price_lak NUMERIC(12,0) NOT NULL,
  options_snapshot JSONB NOT NULL DEFAULT '[]',
  quantity      INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  note          TEXT,
  sent_at       TIMESTAMPTZ,              -- NULL = ຍັງບໍ່ໄດ້ສົ່ງໄປຄົວ
  kitchen_status TEXT NOT NULL DEFAULT 'pending' CHECK (kitchen_status IN ('pending', 'cooking', 'ready', 'served')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ການຊຳລະເງິນ (ຫຼາຍວິທີໃນບິນດຽວໄດ້)
CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id),
  method       TEXT NOT NULL CHECK (method IN ('cash', 'qr', 'card')),
  amount_lak   NUMERIC(12,0) NOT NULL CHECK (amount_lak > 0),  -- ຈຳນວນທີ່ນັບເຂົ້າບິນ
  tendered_lak NUMERIC(12,0),            -- ເງິນສົດທີ່ຮັບມາ (ສຳລັບຄິດເງິນທອນ), NULL ຖ້າບໍ່ແມ່ນເງິນສົດ
  reference    TEXT,                     -- ເລກອ້າງອີງ QR/ບັດ (ບັງຄັບສຳລັບ qr/card)
  received_by  UUID NOT NULL REFERENCES staff(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ການປິດກະ
CREATE TABLE shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES branches(id),
  opened_by     UUID NOT NULL REFERENCES staff(id),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  opening_cash_lak NUMERIC(12,0) NOT NULL DEFAULT 0,
  closing_cash_lak NUMERIC(12,0)
);

-- ຄິວ sync ຈາກເຄື່ອງ offline
CREATE TABLE sync_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES branches(id),
  device_id    TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  client_uuid  UUID NOT NULL UNIQUE,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_branch_created ON orders(branch_id, created_at);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);

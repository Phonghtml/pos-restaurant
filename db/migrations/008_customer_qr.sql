-- 008: ລູກຄ້າສັ່ງອາຫານເອງຜ່ານ QR ທີ່ໂຕະ
-- - qr_token: ລະຫັດສຸ່ມຂອງແຕ່ລະໂຕະ (ໃຊ້ໃນລິ້ງ QR)
-- - pending_confirm: ລາຍການຈາກລູກຄ້າ ລໍຖ້າພະນັກງານຢືນຢັນກ່ອນສົ່ງເຂົ້າຄົວ
-- - ພະນັກງານ "qr-customer" ໃຊ້ເປັນຜູ້ເປີດບິນ ແຕ່ login ບໍ່ໄດ້ (is_active = false)
-- ປອດໄພຮັນຊ້ຳໄດ້

ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pending_confirm BOOLEAN NOT NULL DEFAULT false;

INSERT INTO staff (id, branch_id, name, username, password_hash, role, is_active)
VALUES ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000000001',
        'ລູກຄ້າ QR', 'qr-customer', 'DISABLED', 'waiter', false)
ON CONFLICT (id) DO NOTHING;

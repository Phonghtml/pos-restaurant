-- 002: ເພີ່ມຮູບເມນູ ແລະ ຕົວເລືອກແບບເຝີ (ເລືອກຊະນິດຊີ້ນ) ໃຫ້ທຸກເມນູອາຫານ
-- ໃຊ້ກັບຖານຂໍ້ມູນທີ່ມີຢູ່ແລ້ວ. ປອດໄພຮັນຊ້ຳໄດ້ (ໃຊ້ IF NOT EXISTS / NOT EXISTS)

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ກຸ່ມ "ເລືອກຊະນິດຊີ້ນ" ໃຫ້ທຸກເມນູອາຫານ (ຍົກເວັ້ນນ້ຳດື່ມ)
INSERT INTO menu_option_groups (menu_item_id, name, is_required)
SELECT i.id, 'ເລືອກຊະນິດຊີ້ນ', true
FROM menu_items i
WHERE i.name <> 'ນ້ຳດື່ມ (ຕຸກ)'
  AND NOT EXISTS (
    SELECT 1 FROM menu_option_groups g
    WHERE g.menu_item_id = i.id AND g.name = 'ເລືອກຊະນິດຊີ້ນ'
  );

-- ຕົວເລືອກ: ໝູ່ / ໄກ່ / ເປັດ / ຊີ້ນງົວ (ເພີ່ມລາຄາ 0 ກີບ, ປັບພາຍຫຼັງໄດ້)
INSERT INTO menu_options (option_group_id, name, extra_price_lak, sort_order)
SELECT g.id, v.name, 0, v.sort
FROM menu_option_groups g
CROSS JOIN (VALUES ('ໝູ່', 1), ('ໄກ່', 2), ('ເປັດ', 3), ('ຊີ້ນງົວ', 4)) AS v(name, sort)
WHERE g.name = 'ເລືອກຊະນິດຊີ້ນ'
  AND NOT EXISTS (SELECT 1 FROM menu_options o WHERE o.option_group_id = g.id);

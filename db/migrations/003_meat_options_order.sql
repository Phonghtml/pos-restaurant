-- 003: ຈັດລຳດັບຕົວເລືອກຊີ້ນໃຫ້ເປັນ ໝູ່ / ໄກ່ / ຊີ້ນງົວ / ເປັດ ໃນທຸກເມນູອາຫານ
-- ໃຊ້ໄດ້ກັບຖານຂໍ້ມູນທີ່ຮັນ 002 ແລ້ວ. ປອດໄພຮັນຊ້ຳໄດ້ (ບໍ່ລຶບຂໍ້ມູນເກົ່າ)

-- 1) ກຸ່ມ "ເລືອກຊະນິດຊີ້ນ" ສຳລັບທຸກເມນູອາຫານ (ຍົກເວັ້ນນ້ຳດື່ມ) ຖ້າຍັງບໍ່ມີ
INSERT INTO menu_option_groups (menu_item_id, name, is_required)
SELECT i.id, 'ເລືອກຊະນິດຊີ້ນ', true
FROM menu_items i
WHERE i.name <> 'ນ້ຳດື່ມ (ຕຸກ)'
  AND NOT EXISTS (
    SELECT 1 FROM menu_option_groups g
    WHERE g.menu_item_id = i.id AND g.name = 'ເລືອກຊະນິດຊີ້ນ'
  );

-- 2) ເພີ່ມຕົວເລືອກທີ່ຂາດ (ລາຄາ 0 ກີບ)
INSERT INTO menu_options (option_group_id, name, extra_price_lak, sort_order)
SELECT g.id, v.name, 0, v.sort
FROM menu_option_groups g
CROSS JOIN (VALUES ('ໝູ່', 1), ('ໄກ່', 2), ('ຊີ້ນງົວ', 3), ('ເປັດ', 4)) AS v(name, sort)
WHERE g.name = 'ເລືອກຊະນິດຊີ້ນ'
  AND NOT EXISTS (
    SELECT 1 FROM menu_options o
    WHERE o.option_group_id = g.id AND o.name = v.name
  );

-- 3) ຈັດລຳດັບໃໝ່: ໝູ່=1, ໄກ່=2, ຊີ້ນງົວ=3, ເປັດ=4
UPDATE menu_options o
SET sort_order = v.sort
FROM (VALUES ('ໝູ່', 1), ('ໄກ່', 2), ('ຊີ້ນງົວ', 3), ('ເປັດ', 4)) AS v(name, sort)
WHERE o.name = v.name
  AND o.option_group_id IN (
    SELECT id FROM menu_option_groups WHERE name = 'ເລືອກຊະນິດຊີ້ນ'
  );

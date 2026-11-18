-- 007: ເພີ່ມໂຕະ 5 ຫາ 8 ໃນໂຊນດຽວກັບໂຕະ 4 (ປອດໄພຮັນຊ້ຳໄດ້)
-- ຊື່ໂຕະຄິດຈາກຊື່ໂຕະ 4 ເພື່ອໃຫ້ຮູບແບບຄືກັນ

INSERT INTO tables (branch_id, zone_id, name)
SELECT t.branch_id, t.zone_id,
       SUBSTRING(t.name FROM 1 FOR CHAR_LENGTH(t.name) - 1) || n::text
FROM tables t
CROSS JOIN generate_series(5, 8) AS n
WHERE t.id = '00000000-0000-0000-0000-000000004004'
  AND NOT EXISTS (
    SELECT 1 FROM tables x
    WHERE x.branch_id = t.branch_id
      AND x.name = SUBSTRING(t.name FROM 1 FOR CHAR_LENGTH(t.name) - 1) || n::text
  );

START TRANSACTION;

UPDATE specialties
SET name = CASE id
    WHEN 1 THEN 'Nội tổng quát'
    WHEN 2 THEN 'Tim mạch'
    WHEN 3 THEN 'Nhi khoa'
    WHEN 4 THEN 'Tai mũi họng'
    WHEN 5 THEN 'Da liễu'
    WHEN 6 THEN 'Sản phụ khoa'
    WHEN 7 THEN 'Cơ xương khớp'
    WHEN 8 THEN 'Mắt'
    ELSE name
END
WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8);

COMMIT;

-- ============================================================================
-- SQL Скрипт для проверки реализации LogCChangedObject
-- ============================================================================
-- Использование: выполнить эти запросы в SQL Monitor расширения
-- или через psql после тестирования сохранения метода
-- ============================================================================

-- 1. СПРАВОЧНАЯ ИНФОРМАЦИЯ О ТАБЛИЦЕ LogCChangedObject
-- ============================================================================
-- Проверка структуры таблицы (выполнить один раз)
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'LogCChangedObject'
ORDER BY ordinal_position;

-- ============================================================================
-- 2. ПРОВЕРКА ПАРАМЕТРОВ АТРИБУТОВ (для понимания формата NewValues)
-- ============================================================================
-- Получить информацию об атрибутах 127 (Code) и 102 (SeniorID)
SELECT
  ID,
  Name,
  Aliases,
  DBFieldName,
  Caption
FROM Attributes
WHERE ID IN (127, 102)
ORDER BY ID;

-- ============================================================================
-- 3. ПОИСК ПОСЛЕДНИХ ИЗМЕНЕНИЙ КОНКРЕТНОГО МЕТОДА
-- ============================================================================
-- Замените <METHOD_ID> на реальный ID метода, который вы редактировали
-- Пример: 41657448
SELECT
  ObjID as "Method ID",
  ObjClassID as "Class",
  ChangeType as "Type",
  UserID as "User",
  ComputerName as "Computer",
  ChangeDate as "Date",
  NewValues as "New Values",
  OldValues as "Old Values",
  TransactionComment as "Comment",
  RootObjID as "Class ID",
  RootObjClassID as "Class Type"
FROM LogCChangedObject
WHERE ObjID = <METHOD_ID>
ORDER BY ChangeDate DESC
LIMIT 5;

-- ============================================================================
-- 4. ПРОВЕРКА КОРРЕКТНОСТИ ФОРМАТА NewValues И OldValues
-- ============================================================================
-- Получить последнее изменение с полной информацией
SELECT
  ObjID,
  NewValues,
  OldValues,
  LENGTH(NewValues) as "NewValues Length",
  LENGTH(OldValues) as "OldValues Length"
FROM LogCChangedObject
WHERE ObjClassID = 5 -- объект метода
ORDER BY ChangeDate DESC
LIMIT 1;

-- Пояснение формата:
-- NewValues должны быть: 127,"<код>",102,<SeniorID>
-- OldValues должны быть: 127,"<код>",102,<SeniorID>
-- Кавычки в коде экранируются как ""

-- ============================================================================
-- 5. ПРОВЕРКА ЗНАЧЕНИЙ UserID И ComputerName
-- ============================================================================
-- Получить уникальные значения UserID и ComputerName из недавних изменений
SELECT DISTINCT
  UserID,
  ComputerName,
  COUNT(*) as "Count"
FROM LogCChangedObject
WHERE ChangeDate > NOW() - INTERVAL '7 days'
GROUP BY UserID, ComputerName
ORDER BY ChangeDate DESC;

-- ============================================================================
-- 6. ПРОВЕРКА ВЕРСИИ ОБЪЕКТА (VersionObject всегда 1899-12-30)
-- ============================================================================
SELECT
  VersionObject,
  COUNT(*) as "Count"
FROM LogCChangedObject
WHERE ObjClassID = 5 -- методы
GROUP BY VersionObject;

-- ============================================================================
-- 7. ПРОВЕРКА ТИПОВ ИЗМЕНЕНИЙ
-- ============================================================================
-- ChangeType = 2 означает изменение существующего объекта
SELECT
  ChangeType,
  COUNT(*) as "Count"
FROM LogCChangedObject
WHERE ObjClassID = 5
GROUP BY ChangeType;

-- ============================================================================
-- 8. СРАВНЕНИЕ СТАРОГО И НОВОГО КОДА
-- ============================================================================
-- Для конкретного метода - посмотреть историю изменений
-- Замените <METHOD_ID> на ID метода (41657448 в примере)
WITH method_changes AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY ChangeDate DESC) as "Version",
    ObjID,
    NewValues,
    OldValues,
    ChangeDate,
    UserID,
    ComputerName
  FROM LogCChangedObject
  WHERE ObjID = <METHOD_ID>
  ORDER BY ChangeDate DESC
  LIMIT 10
)
SELECT
  "Version",
  ObjID,
  ChangeDate,
  UserID,
  ComputerName,
  -- Извлечение примерно первых 100 символов из NewValues
  CASE
    WHEN LENGTH(NewValues) > 150
    THEN SUBSTR(NewValues, 1, 150) || '...'
    ELSE NewValues
  END as "Code Snippet"
FROM method_changes;

-- ============================================================================
-- 9. ПРОВЕРКА ИНТЕГРАЦИИ С СИНХРОНИЗАЦИЕЙ ПАКЕТОВ
-- ============================================================================
-- Получить класс, который содержит изменённый метод
-- Замените <METHOD_ID> на ID метода (41657448 в примере)
SELECT
  lc.ObjID as "Method ID",
  lc.RootObjID as "Class ID",
  lc.ChangeDate,
  lc.UserID,
  a.Name as "Class Name"
FROM LogCChangedObject lc
LEFT JOIN Abstract a ON a.ID = lc.RootObjID
WHERE lc.ObjID = <METHOD_ID>
ORDER BY lc.ChangeDate DESC
LIMIT 3;

-- ============================================================================
-- 10. ПРОВЕРКА КОРРЕКТНОСТИ ДАННЫХ В ТАБЛИЦАХ Methods И Abstract
-- ============================================================================
-- Замените <METHOD_ID> на ID метода (41657448 в примере)
SELECT
  m.ID,
  m.Name,
  m.SeniorID,
  m.LastChange,
  m.Code as "Code Preview",
  a.Name as "Class Name",
  a.LastChange as "Abstract LastChange",
  a.SeniorID as "Abstract SeniorID"
FROM Methods m
LEFT JOIN Abstract a ON a.ID = m.SeniorID
WHERE m.ID = <METHOD_ID>;

-- ============================================================================
-- 11. ПОИСК МЕТОДОВ С НАИБОЛЬШИМ КОЛИЧЕСТВОМ ИЗМЕНЕНИЙ
-- ============================================================================
-- Полезно для проверки, что система работает
SELECT
  ObjID as "Method ID",
  COUNT(*) as "Changes Count",
  MAX(ChangeDate) as "Last Change"
FROM LogCChangedObject
WHERE ObjClassID = 5
GROUP BY ObjID
ORDER BY "Changes Count" DESC
LIMIT 10;

-- ============================================================================
-- 12. ЭКСПОРТ ПОЛНОЙ ИСТОРИИ ИЗМЕНЕНИЙ МЕТОДА
-- ============================================================================
-- Замените <METHOD_ID> на ID метода (41657448 в примере)
-- Результат можно экспортировать в CSV
\COPY (
  SELECT
    ChangeDate,
    UserID,
    ComputerName,
    NewValues,
    OldValues
  FROM LogCChangedObject
  WHERE ObjID = <METHOD_ID>
  ORDER BY ChangeDate ASC
) TO STDOUT WITH (FORMAT CSV, HEADER);

-- ============================================================================
-- ПРИМЕЧАНИЯ И СОВЕТЫ
-- ============================================================================
-- 1. Все даты в ChangeDate должны быть в UTC или местное время сервера БД
-- 2. ComputerName должен соответствовать имени компьютера расширения
-- 3. UserID должен быть 3130673 (или установленное значение VC_VE_USER_ID)
-- 4. NewValues и OldValues должны начинаться с "127,"
-- 5. Если что-то не работает, проверьте SQL Monitor в расширении (Alt+Shift+I)
-- ============================================================================

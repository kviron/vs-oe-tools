# Реализация логирования изменений методов в LogCChangedObject

## 📋 Обзор изменений

Расширение VC-VE-Tools теперь полностью поддерживает регистрацию изменений методов в таблице `LogCChangedObject` согласно логике стандартного редактора Восточного Экспресса.

## 🔧 Измененные и новые файлы

### 1. **Новый файл: `src/infrastructure/configuration/sessionContext.ts`**

Модуль для получения контекста сессии:
- `getSessionContext(client, databaseName)` - получает UserID, ComputerName и текущее время с сервера БД
- Получает UserID из переменной окружения `VC_VE_USER_ID`
- Получает ComputerName через `os.hostname()`
- Получает ChangeDate от сервера БД через `SELECT NOW()`

**Конфигурация:**
```bash
# Установить переменную окружения перед запуском расширения
export VC_VE_USER_ID=3130673
```

### 2. **Новый файл: `src/infrastructure/database/changeValuesSerialization.ts`**

Модуль для сериализации и десериализации значений атрибутов:

#### Функция `serializeChangeValues(code, seniorId)`
Сериализует значения атрибутов для полей `NewValues` и `OldValues`:

**Формат:**
```
127,"<текст кода>",102,<SeniorID>
```

**Где:**
- `127` - ID атрибута Methods.Code
- `"<текст кода>"` - содержимое кода (кавычки внутри экранируются как `""`)
- `102` - ID атрибута Methods.SeniorID
- `<SeniorID>` - ID родительского класса

**Пример:**
```
127,"procedure (Sender: wPersistent);

begin

end;
",102,10824991
```

#### Функция `deserializeChangeValues(serialized)`
Разбирает сериализованную строку (для проверки и отладки).

**Примеры обработки специальных символов:**
- Переводы строк в коде сохраняются как есть
- Кавычки в коде экранируются удвоением: `"` → `""`
- На выходе эти двойные кавычки преобразуются обратно в одиночные

### 3. **Модифицированный файл: `src/infrastructure/database/methodRepository.ts`**

Функция `saveMethodSource(method, code)` переработана для:

#### Процесс сохранения:
1. **Начало транзакции** - `BEGIN`
2. **Получение старого кода** - `SELECT code FROM methods WHERE id = $1` (внутри транзакции!)
3. **Сравнение кодов**:
   - Если код не изменился → `ROLLBACK` и выход
   - Если код изменился → продолжить
4. **Получение контекста сессии** - `getSessionContext()`
5. **UPDATE methods** - обновление кода и даты
6. **UPDATE abstract** - синхронизация абстрактного объекта
7. **Сериализация** - формирование NewValues и OldValues через `serializeChangeValues()`
8. **INSERT LogCChangedObject** - запись в журнал изменений
9. **COMMIT** - фиксирование всех изменений

#### Параметры INSERT LogCChangedObject:

| Параметр | Источник | Пример значения |
|----------|----------|-----------------|
| ObjID | method.id | 41657448 |
| ObjClassID | константа | 5 (объект метода) |
| ChangeType | константа | 2 (изменение) |
| NewValues | `serializeChangeValues(code, seniorId)` | `127,"<новый код>",102,10824991` |
| UserID | sessionContext.userId | 3130673 |
| ComputerName | sessionContext.computerName | OE-070.soft-oe.consultant.tpi.ru |
| ChangeDate | sessionContext.changeDate | 2026-09-02 13:00:13 |
| OldValues | `serializeChangeValues(oldCode, seniorId)` | `127,"<старый код>",102,10824991` |
| TransactionComment | константа | '' (пусто) |
| VersionObject | константа | 1899-12-30 (нулевая дата) |
| RootObjID | method.seniorId | 10824991 |
| RootObjClassID | константа | 3 (класс класса) |

## 📝 SQL запросы

### Получение старого кода (внутри транзакции)
```sql
SELECT method.code, pg_typeof(method.code)::text AS codetype
FROM methods AS method
WHERE method.id = $1
```

### Обновление Methods
```sql
UPDATE methods
SET lastchange = $1, code = $2, seniorid = $3
WHERE id = $4
```
Параметры: `[lastChange, codeValue, seniorId, methodId]`

### Обновление Abstract
```sql
UPDATE abstract
SET lastchange = $1, seniorid = $2
WHERE id = $3
```
Параметры: `[lastChange, seniorId, methodId]`

### Логирование изменения
```sql
INSERT INTO LogCChangedObject (
  ObjID, ObjClassID, ChangeType, NewValues, UserID, ComputerName,
  ChangeDate, OldValues, TransactionComment, VersionObject,
  RootObjID, RootObjClassID
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
)
```

## ✅ Требования реализации

- [x] При открытии редактора сохранить исходный текст кода в памяти расширения
  - Исходный код сохраняется в `MethodSource.code` при загрузке через `getMethodSource()`
  
- [x] Перед сохранением сравнивать исходный и новый код
  - Выполняется внутри транзакции через SELECT старого кода
  
- [x] Если код не изменился — не выполнять UPDATE и не создавать LogCChangedObject
  - При совпадении кодов выполняется ROLLBACK и функция возвращает управление
  
- [x] Если код изменился — выполнить полный цикл обновления и логирования
  - UPDATE Methods, UPDATE Abstract, INSERT LogCChangedObject в одной транзакции
  
- [x] Использовать параметризованные SQL-запросы
  - Все запросы используют параметры `$1, $2, ...` вместо конкатенации строк
  
- [x] Получать старый код непосредственно из БД перед UPDATE
  - Выполняется внутри того же подключения и транзакции
  
- [x] Использовать текущего пользователя, имя компьютера и серверное время
  - UserID из `VC_VE_USER_ID` переменной окружения
  - ComputerName из `os.hostname()`
  - ChangeDate от сервера БД через `SELECT NOW()`
  
- [x] Корректно обрабатывать кавычки, переводы строк и специальные символы
  - Кавычки экранируются как `""` при сериализации и восстанавливаются при десериализации
  - Переводы строк сохраняются как есть в тексте кода
  
- [x] При ошибке любой операции выполнить ROLLBACK
  - Используется try/catch с гарантированным ROLLBACK при ошибке

## 🧪 Тестовый сценарий

### Подготовка

1. **Установить UserID в переменную окружения:**
   ```bash
   $env:VC_VE_USER_ID = "3130673"
   ```

2. **Запустить расширение с этой переменной окружения**

### Тест 1: Изменение кода без сохранения

1. Открыть метод через Проводник расширения
2. Отредактировать код (добавить комментарий, изменить переводы строк и т.д.)
3. **Не сохранять** - просто закрыть редактор
4. **Ожидаемо:** В LogCChangedObject нет новой записи

### Тест 2: Сохранение с изменением кода

1. Открыть метод через Проводник расширения
2. Изменить код (например, добавить комментарий):
   ```pascal
   // Мой комментарий
   procedure (Sender: wPersistent);
   begin
     // Новая строка
   end;
   ```
3. Сохранить (Ctrl+S)
4. Проверить логирование:
   ```sql
   SELECT ObjID, NewValues, OldValues, ChangeDate, UserID, ComputerName
   FROM LogCChangedObject
   WHERE ObjID = <ID_метода>
   ORDER BY ChangeDate DESC
   LIMIT 1;
   ```
   - NewValues должны содержать новый код
   - OldValues должны содержать старый код
   - UserID должен быть 3130673
   - ComputerName должно быть имя вашего компьютера
   - ChangeDate должна быть близкой к текущему времени

### Тест 3: Сохранение без изменений

1. Открыть метод
2. Не менять код
3. Сохранить (Ctrl+S)
4. Проверить LogCChangedObject - новой записи не должно быть
5. Статус-бар должен показать "Метод ... сохранён в Windows-1251" (но без INSERT-а)

### Тест 4: Проверка в "Синхронизация пакетов"

1. После сохранения метода с изменением кода
2. Открыть "Синхронизация пакетов"
3. Найти класс, к которому принадлежит метод (RootObjID = SeniorID)
4. **Ожидаемо:** Класс должен отображаться как измененный
5. Должны видны изменения в методе в дереве изменений

## 🔍 Проверка данных в БД

### Просмотр последних изменений для метода

```sql
SELECT 
  ObjID,
  ObjClassID,
  ChangeType,
  NewValues,
  OldValues,
  UserID,
  ComputerName,
  ChangeDate,
  TransactionComment,
  VersionObject,
  RootObjID,
  RootObjClassID
FROM LogCChangedObject
WHERE ObjID = <ID_метода>
ORDER BY ChangeDate DESC
LIMIT 10;
```

### Декодирование NewValues

```sql
-- Для примера значения: 127,"procedure (Sender: wPersistent);\nbegin\nend;",102,10824991
SELECT NewValues FROM LogCChangedObject
WHERE ObjID = <ID_метода>
ORDER BY ChangeDate DESC
LIMIT 1;

-- Результат должен быть в формате: 127,"<код>",102,<SeniorID>
```

## ⚠️ Важные замечания

### 1. **Переменная окружения VC_VE_USER_ID обязательна**
Если переменная не установлена, при попытке сохранить изменение метода получится ошибка:
```
Переменная окружения VC_VE_USER_ID не установлена. Требуется ID пользователя для логирования изменений.
```

**Решение:** Установить переменную перед запуском расширения:
```bash
# Windows (PowerShell)
$env:VC_VE_USER_ID = "3130673"
code

# Windows (CMD)
set VC_VE_USER_ID=3130673
code

# Linux/macOS
export VC_VE_USER_ID=3130673
code
```

### 2. **Кодировка текста кода**
- Код сохраняется в кодировке Windows-1251 (Cyrillic)
- NewValues и OldValues содержат текст кода в исходной кодировке
- Кавычки в коде ОБЯЗАТЕЛЬНО экранируются как `""`

### 3. **Сравнение кодов**
Сравнение выполняется ПОСЛЕ декодирования из БД, поэтому:
- Если в БД код в bytea (бинарный), он декодируется из Windows-1251
- Сравнение происходит со строковыми значениями
- Пробелы и переводы строк учитываются

### 4. **Транзакция ACID**
Все операции выполняются в одной транзакции:
- Если любая операция не выполнится → ROLLBACK ВСЕ изменения
- LogCChangedObject заполняется ТОЛЬКО если UPDATE успешны

### 5. **ComputerName формат**
ComputerName получается от OS как `os.hostname()`. Примеры:
- Windows: `OE-070`
- Linux: `server-01`
- macOS: `MacBook-Pro.local`

## 📊 Примеры данных из LogCChangedObject

### NewValues пример 1 (однострочный код):
```
127,"procedure (Sender: wPersistent);",102,10824991
```

### NewValues пример 2 (многострочный код с комментариями):
```
127,"procedure (Sender: wPersistent);
begin
  // Новая логика
  SomeMethod();
end;
",102,10824991
```

### NewValues пример 3 (код с кавычками):
```
127,"procedure (Sender: wPersistent);
begin
  ShowMessage(""Hello, World!"");
end;
",102,10824991
```

При десериализации двойные кавычки `""` восстанавливаются в одиночные `"`.

## 🐛 Отладка

### Если LogCChangedObject не заполняется:

1. **Проверить переменную окружения:**
   ```powershell
   $env:VC_VE_USER_ID
   ```
   Должно вывести число, например `3130673`

2. **Проверить сохранение кода:**
   - Отредактировать код явно (добавить символ)
   - Нажать Ctrl+S
   - Убедиться, что в статус-баре появилось "Метод ... сохранён в Windows-1251"

3. **Проверить логи расширения:**
   - Открыть Developer Tools (F12)
   - Посмотреть консоль на предмет ошибок
   - Проверить SQL Monitor в расширении (Alt+Shift+I)

4. **Проверить БД напрямую:**
   ```sql
   SELECT COUNT(*) FROM LogCChangedObject;
   ```

## 📚 Ссылки на документацию

- [PostgreSQL: Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [Node.js: os.hostname()](https://nodejs.org/api/os.html#os_os_hostname)
- [Восточный Экспресс: LogCChangedObject](внутренняя документация)

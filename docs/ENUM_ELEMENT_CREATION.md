# Creating enumeration elements

`create_enum_element` creates an **element**, not an enumeration class. Parameters:
`classId`, identifier `name`, display text `fullName` (1–100 characters), and int32 `ord`.
The bridge supplies and verifies the selected database, host and port. All text must
round-trip through Windows-1251. No automatic truncation or duplicate retry occurs.

## Client code checked before implementation

In the trunk package sources and live `oetrunk` metadata on 2026-10-05:

- `Перечисление` (23101) stores `FullName` (attribute 23102) in `Enum`;
  `Name`, `Ord`, and `SysFile` are attributes 103, 104, and 106.
- `ПриПравке_Редактировать` (12607011) opens `ДПеречисление` (12606928).
  Its object datasource edits `_Имя`, `ПолноеИмя`, and `_Порядок` through the
  inherited object persistence path; it declares no enum insertion method.
- `ClassUtils.mcp_class_method_add` (12464789) uses the developer-ID mode,
  `Create`, `Apply`, then package placement. No enum-add MCP method was found
  among the package `mcp_` declarations or live method searches.
- `ДПанельЖЦ.AddEnum` (8930431) and `wUniEdit.MakeEnum` (8937930) build UI lists;
  they do not persist enumeration elements.
- The definition of `OE_SYSTEM_GENGUID_ENUM_RANGES_V3` computes the next ID
  as `MAX(Abstract.ID)+1` inside a range; it does not reserve IDs or lock writers.

The native Delphi engine implementation was not available in this checkout.
This is a constrained extension persistence implementation, not proof that all
native object lifecycle hooks have been reproduced. Only concrete **direct**
subclasses of 23101 stored in `Enum` are supported. Developer ranges with holes
are rejected. Restart the native client before relying on refreshed enum caches.

## SQL monitor evidence and package placement

User-created error `3200479` belongs to class `10609210`.
The captured monitor segment contains **no initial INSERT**; it shows the later
`Abstract.SysFile=179364695` assignment and `SysPackageBase` registration for
`_Система/#package$`. The verified class file is `179447980` in `Консультант`.
This incorrect placement is not reproduced by the new tool.

## Transaction contract

Before inserts, validate class storage and concrete class package file, reject
duplicates, and select a current-user developer range below 13000000. Lock
`Abstract` briefly with SHARE ROW EXCLUSIVE to serialize ID allocation against
native inserts too (2-second lock timeout; 15-second statement timeout).
Write audit, `Enum`, `Abstract` with the concrete SysFile, and file synchronization
state in one transaction. Reread all requested fields and package state after
commit. A failed post-commit readback reports the committed ID and explicitly
forbids blind recreation. The tool never moves or changes existing elements.

Testing uses an injected SQL client for transaction failure paths and validation
tests for bridge targeting, length and encoding. This is not live creation proof.

## Editing existing elements

`update_enum_element` accepts `objectId`, `classId`, the complete desired `name`,
`fullName`, `ord`, and `previous: { name, fullName, ord }` from the last read.
Read an element using `search_class_dictionary` or `get_class_dictionary` first.
The same class/storage, 100-character and Windows-1251 restrictions apply.
It verifies previous values under row locks and rejects stale edits or duplicate
names. It does not change the element ID, class or package. Package placement does not block editing. Use check_object_package_binding separately.

The transaction updates both `Enum` and `Abstract`, records old and new values
in `LogCChangedObject` with change type 2, and registers a change for the existing file when assigned.
It verifies the edited fields in both copies after commit. Identical input is
a no-op with no new audit entry. Any error after commit explicitly reports that
the transaction completed and the object must be reread before retrying.

Update tests cover stale reads, duplicate names, database/class mismatch, editing independently of package placement, audit/update/package failure rollback, and post-commit errors.
No live metadata was modified to test either tool in this development session.

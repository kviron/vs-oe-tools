# Binding and moving metadata objects

`bind_objects_to_package` assigns the explicitly listed `objectIds` to one
concrete file selected by `sysFileId` or by a correctly bound `templateObjectId`.
It supports both initial assignment (`Abstract.SysFile IS NULL`) and moving
objects from another file, including a `#package$` source. A `#package$` target
is rejected. Descendants are not implicitly moved; list their IDs explicitly.

The transaction verifies the database, locks the object rows, replaces changed
bindings and registers all source files and the destination in `SysPackageBase`.
Missing objects or failure to register any file roll back the entire operation.
It rereads the object bindings after commit; a readback failure reports that the
transaction already committed, so the caller must reread before retrying.

The result includes `changedObjectIds`, `unchangedObjectIds`, `changedFileIds`
and `movedObjects` with `objectId`, `previousSysFileId` and `sysFileId`.
Repeated binding to the same target does not update object rows; the target
file is still registered for synchronization, preserving the existing behavior.

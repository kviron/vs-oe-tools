const productionTaskSelectSql = `SELECT T0.ID AS id,
  COALESCE(CAST(T0.DNumber AS VARCHAR(64)), '') AS number,
  COALESCE(CAST(SO1.FName AS VARCHAR(250)), '') AS state,
  COALESCE(CAST(left(T0.Description, 6000) AS VARCHAR(6000)), '') AS title,
  COALESCE(CAST(DateToStrFmt(T0.CreDate, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS created,
  COALESCE(CAST(DateToStrFmt(T0.Deadline, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS deadline,
  COALESCE((SELECT CAST(SA.FName AS VARCHAR(250)) FROM StructureActivity SA WHERE SA.ID = T0.KindActivity), '') AS activitykind,
  COALESCE((SELECT CAST(SO2.FName AS VARCHAR(250)) FROM TypeWork SO2 WHERE SO2.ID = T0.Tip), '') AS worktype,
  CAST(COALESCE((SELECT string_agg(CAST(PD.Description AS VARCHAR(6000)), ', ')
    FROM ProjectDoc PD
    WHERE commagetpos((SELECT R.Refs FROM GETREFOBJECTS(T0.ID, 8927966, 8927510) R), PD.ID) > -1), '') AS VARCHAR(6000)) AS project,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Initiator), '') AS author,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Manager), '') AS manager,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Analizer), '') AS analyst,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Executor), '') AS executor,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.RespPerson), '') AS responsibleuser,
  COALESCE(T0.RespPerson, 0) AS responsibleuserid,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)) FROM Persons P WHERE P.ID = T0.Controller), '') AS reviewer,
  COALESCE(CAST(T0.Mantis AS VARCHAR(1000)), '') AS appeal,
  COALESCE(CAST(T0.PackageOfWork AS VARCHAR(250)), '') AS packagename,
  CAST(COALESCE((SELECT string_agg(CAST(PN.Name AS VARCHAR(1000)), ', ')
    FROM PartNews PN
    WHERE commagetpos((SELECT R.Refs FROM GETREFOBJECTS(T0.ID, 10763223, 10160264) R), PN.ID) > -1), '') AS VARCHAR(6000)) AS newssection,
  COALESCE((SELECT CAST(E.Name AS VARCHAR(250)) FROM Enum E WHERE E.ID = T0.Priority), '') AS priority,
  COALESCE(CAST(T0.Intensity AS VARCHAR(64)), '') AS effort,
  COALESCE((SELECT CAST(R.ReleaseByDigits AS VARCHAR(64)) FROM URRelease R WHERE R.ID = T0.ReleasePlan), '') AS releaseplan,
  COALESCE((SELECT CAST(R.ReleaseByDigits AS VARCHAR(64)) FROM URRelease R WHERE R.ID = T0.ReleaseFact), '') AS releaseactual,
  COALESCE(CAST(T0.Revision_ReleaseBefore AS VARCHAR(64)), '') AS revisiontrunk,
  COALESCE(CAST(T0.Revision_ReleaseFact AS VARCHAR(64)), '') AS revisionbranch,
  COALESCE(CAST((SELECT COUNT(SF.ID) FROM StoredFiles SF
    WHERE SF.SeniorID = T0.ID OR SF.RootObj = T0.ID OR SF.MainStoredFile IN
      (SELECT PSF.ID FROM StoredFiles PSF WHERE PSF.SeniorID = T0.ID OR PSF.RootObj = T0.ID)) AS VARCHAR(64)), '0') AS attachmentcount,
  COALESCE(CAST(left(T0.Comment, 6000) AS VARCHAR(6000)), '') AS workdescription,
  COALESCE((SELECT CAST(left(H.Comment, 6000) AS VARCHAR(6000)) FROM HistoryLC H WHERE H.ID = T0.LCLastActionID), '') AS statecomment,
  COALESCE((SELECT CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000))
    FROM HistoryLC H JOIN Persons P ON P.ID = H.Person WHERE H.ID = T0.LCLastActionID), '') AS statecommentauthor
FROM WorkDoc T0
LEFT JOIN StateLC SO1 ON SO1.ID=T0.LCStateID`;

export const productionTaskSql = `${productionTaskSelectSql}
ORDER BY T0.CreDate DESC, T0.ID DESC`;

// The table does not need the full card's comments, lifecycle history, news sections,
// or all participant names. Keep these expensive fields in the exact-task query.
const productionTaskListSelectSql = `SELECT T0.ID AS id,
  COALESCE(CAST(T0.DNumber AS VARCHAR(64)), '') AS number,
  COALESCE(CAST(S.FName AS VARCHAR(250)), '') AS state,
  COALESCE(CAST(left(T0.Description, 6000) AS VARCHAR(6000)), '') AS title,
  COALESCE(CAST(DateToStrFmt(T0.CreDate, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS created,
  COALESCE(CAST(DateToStrFmt(T0.Deadline, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS deadline,
  COALESCE(CAST(W.FName AS VARCHAR(250)), '') AS worktype,
  CAST(COALESCE((SELECT string_agg(CAST(PD.Description AS VARCHAR(6000)), ', ')
    FROM ProjectDoc PD
    WHERE commagetpos((SELECT R.Refs FROM GETREFOBJECTS(T0.ID, 8927966, 8927510) R), PD.ID) > -1), '') AS VARCHAR(6000)) AS project,
  COALESCE(CAST(TrimAll(COALESCE(E.Fam || ' ', '') || COALESCE(E.Im || ' ', '') ||
    CASE WHEN E.WithoutPatro <> 0 THEN '' ELSE COALESCE(E.Ot, '') END) AS VARCHAR(1000)), '') AS executor,
  COALESCE(CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)), '') AS responsibleuser,
  COALESCE(T0.RespPerson, 0) AS responsibleuserid,
  COALESCE(CAST(T0.Mantis AS VARCHAR(1000)), '') AS appeal,
  COALESCE(CAST(T0.PackageOfWork AS VARCHAR(250)), '') AS packagename,
  COALESCE(CAST(PR.Name AS VARCHAR(250)), '') AS priority,
  COALESCE(CAST(RL.ReleaseByDigits AS VARCHAR(64)), '') AS releaseplan,
  COALESCE(CAST((SELECT COUNT(SF.ID) FROM StoredFiles SF
    WHERE SF.SeniorID = T0.ID OR SF.RootObj = T0.ID OR SF.MainStoredFile IN
      (SELECT PSF.ID FROM StoredFiles PSF WHERE PSF.SeniorID = T0.ID OR PSF.RootObj = T0.ID)) AS VARCHAR(64)), '0') AS attachmentcount
FROM WorkDoc T0
LEFT JOIN StateLC S ON S.ID = T0.LCStateID
LEFT JOIN TypeWork W ON W.ID = T0.Tip
LEFT JOIN Persons E ON E.ID = T0.Executor
LEFT JOIN Persons P ON P.ID = T0.RespPerson
LEFT JOIN Enum PR ON PR.ID = T0.Priority
LEFT JOIN URRelease RL ON RL.ID = T0.ReleasePlan`;

export function productionTaskListSql(responsiblePersonId?: number): string {
	if (responsiblePersonId !== undefined && (!Number.isSafeInteger(responsiblePersonId) || responsiblePersonId <= 0)) {
		throw new Error('ID ответственного должен быть положительным целым числом.');
	}
	const where = responsiblePersonId === undefined ? '' : `\nWHERE T0.RespPerson = ${responsiblePersonId}`;
	return `${productionTaskListSelectSql}${where}\nORDER BY T0.CreDate DESC, T0.ID DESC`;
}

// Load the selector independently of task cards, so every responsible user remains
// available even when the table is filtered to the signed-in person.
export const productionTaskUsersSql = `SELECT P.ID AS id,
  COALESCE(CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)), '') AS name
FROM Persons P
WHERE EXISTS (SELECT T.ID FROM WorkDoc T WHERE T.RespPerson = P.ID)
ORDER BY name, P.ID`;

export function productionTaskByIdSql(id: number): string {
	if (!Number.isSafeInteger(id) || id <= 0) { throw new Error('ID задачи должен быть положительным целым числом.'); }
	return `${productionTaskSelectSql}\nWHERE T0.ID = ${id}\nLIMIT 1`;
}

export function productionTaskReferenceSql(reference: number): string {
	if (!Number.isSafeInteger(reference) || reference <= 0) {
		throw new Error('Номер или ID задачи должен быть положительным целым числом.');
	}
	return `${productionTaskSelectSql}\nWHERE T0.DNumber = ${reference} OR T0.ID = ${reference}\nLIMIT 1`;
}

export function productionTaskSearchSql(query: string, limit = 10): string {
	const normalizedQuery = query.trim();
	if (!normalizedQuery) {
		throw new Error('Укажите ID, номер или часть названия задачи.');
	}
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
		throw new Error('Лимит поиска задач должен быть целым числом от 1 до 25.');
	}
	if (/^\d+$/.test(normalizedQuery)) {
		const reference = Number(normalizedQuery);
		if (!Number.isSafeInteger(reference) || reference <= 0) {
			throw new Error('Номер или ID задачи должен быть положительным целым числом.');
		}
		return `${productionTaskSelectSql}\nWHERE T0.ID = ${reference} OR T0.DNumber = ${reference}\nORDER BY CASE WHEN T0.ID = ${reference} THEN 0 ELSE 1 END\nLIMIT ${limit}`;
	}
	const escapedQuery = normalizedQuery.replace(/'/g, "''");
	return `${productionTaskSelectSql}\nWHERE T0.Description ILIKE '%${escapedQuery}%'\nORDER BY CASE WHEN T0.Description ILIKE '${escapedQuery}' THEN 0 ELSE 1 END, T0.CreDate DESC, T0.ID DESC\nLIMIT ${limit}`;
}

export function productionTaskAttachmentsSql(taskId: number): string {
	if (!Number.isSafeInteger(taskId) || taskId <= 0) {
		throw new Error('ID задачи для загрузки вложений должен быть положительным целым числом.');
	}
	return `SELECT SF.ID AS id,
  COALESCE(CAST(SF.Name AS VARCHAR(1000)), '') AS name,
  COALESCE(CAST(SF.FileName AS VARCHAR(1000)), '') AS filename,
  COALESCE(CAST(SF.FileExtension AS VARCHAR(64)), '') AS fileextension,
  COALESCE(CAST(SF.FileSizeStr AS VARCHAR(64)), '') AS filesizestr,
  COALESCE(CAST(SF.FileSize AS VARCHAR(64)), '') AS filesize,
  COALESCE(CAST(DateToStrFmt(SF.ChangeDate, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS changed,
  COALESCE(CAST(left(SF.Comment, 2000) AS VARCHAR(2000)), '') AS comment,
  COALESCE(CAST(SF.StorageFileID AS VARCHAR(2000)), '') AS storagefileid,
  COALESCE(CAST(SF.StorageType AS VARCHAR(64)), '') AS storagetype,
  COALESCE(SF.MainStoredFile, 0) AS mainstoredfile,
  COALESCE(SF.Important, 0) AS important
FROM StoredFiles SF
WHERE SF.SeniorID = ${taskId} OR SF.RootObj = ${taskId} OR SF.MainStoredFile IN
  (SELECT PSF.ID FROM StoredFiles PSF WHERE PSF.SeniorID = ${taskId} OR PSF.RootObj = ${taskId})
ORDER BY SF.Name, SF.ID
LIMIT 250`;
}

export function productionTaskRichDescriptionSql(taskId: number): string {
	if (!Number.isSafeInteger(taskId) || taskId <= 0) {
		throw new Error('ID задачи для загрузки форматированного описания должен быть положительным целым числом.');
	}
	// Comment_Rich is the RTF value bound to the native wRichEdit. Load it only
	// for an opened card: embedded images can make this field much larger than Comment.
	return `SELECT COALESCE(CAST(left(T0.Comment_Rich, 8000000) AS VARCHAR(8000000)), '') AS richdescription
FROM WorkDoc T0
WHERE T0.ID = ${taskId}
LIMIT 1`;
}

export function productionTaskHistorySql(taskId: number): string {
	if (!Number.isSafeInteger(taskId) || taskId <= 0) {
		throw new Error('ID задачи для загрузки истории должен быть положительным целым числом.');
	}
	return `SELECT H.ID AS id,
  COALESCE(CAST(DateToStrFmt(H.CreDate, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS created,
  COALESCE(CAST(A.FName AS VARCHAR(1000)), '') AS action,
  COALESCE(CAST(S.FName AS VARCHAR(1000)), '') AS state,
  COALESCE(CAST(TrimAll(COALESCE(P.Fam || ' ', '') || COALESCE(P.Im || ' ', '') ||
    CASE WHEN P.WithoutPatro <> 0 THEN '' ELSE COALESCE(P.Ot, '') END) AS VARCHAR(1000)), '') AS person,
  COALESCE(CAST(left(H.Comment, 6000) AS VARCHAR(6000)), '') AS comment
FROM HistoryLC H
LEFT JOIN ActionLC A ON A.ID = H.ActionID
LEFT JOIN StateLC S ON S.ID = H.EndState
LEFT JOIN Persons P ON P.ID = H.Person
WHERE H.SeniorID = ${taskId}
ORDER BY H.CreDate DESC, H.ID DESC
LIMIT 250`;
}

const actionBeginStatesAttributeId = 12956168;

export function productionTaskActionsSql(taskId: number): string {
	if (!Number.isSafeInteger(taskId) || taskId <= 0) {
		throw new Error('ID задачи для загрузки действий должен быть положительным целым числом.');
	}
	return `SELECT DISTINCT A.ID AS id,
  COALESCE(CAST(NULLIF(A.FName, '') AS VARCHAR(1000)), CAST(A.Name AS VARCHAR(1000)), '') AS name,
  COALESCE(CAST(A.Verb AS VARCHAR(1000)), '') AS verb,
  COALESCE(CAST(S.FName AS VARCHAR(1000)), '') AS targetstate,
  COALESCE(CAST(A.GroupName AS VARCHAR(1000)), '') AS actiongroup,
  COALESCE(A.IsComment, 0) AS requirescomment,
  COALESCE(A.MandatoryComment, 0) AS mandatorycomment,
  COALESCE(A.IsCause, 0) AS requirescause,
  COALESCE(A.IsDate, 0) AS requiresdate,
  COALESCE(G.Ord, 999999) AS groupord,
  COALESCE(A.Ord, 0) AS actionord
FROM WorkDoc T0
JOIN Refs R ON R.ObjID = T0.LCStateID AND R.AttrID = ${actionBeginStatesAttributeId}
JOIN ActionLC A ON A.ID = R.SeniorID
LEFT JOIN StateLC S ON S.ID = A.EndState
LEFT JOIN ActionsLC_Group G ON G.ID = A.GroupLC
WHERE T0.ID = ${taskId}
ORDER BY groupord, actiongroup, actionord, name, id
LIMIT 100`;
}

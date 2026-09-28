export interface ProductionTaskSvnRow {
	id: string;
	repository_root: string;
	revision: number;
	author: string;
	committed_at: string;
	message: string;
	paths_json: string;
}

export interface ProductionTaskSvnResult { commits: ProductionTaskSvnRow[]; scannedAt: string | null }

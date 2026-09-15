export interface ManagedHttpServer {
	stop(): Promise<void>;
}

/** Serializes process changes, including cleanup when a start is still pending. */
export class HttpServerLifecycle<T extends ManagedHttpServer> {
	public server?: T;
	private pending: Promise<unknown> = Promise.resolve();

	public replace(start?: () => Promise<T>): Promise<T | undefined> {
		const operation = this.pending.then(async () => {
			await this.server?.stop();
			this.server = undefined;
			if (start) { this.server = await start(); }
			return this.server;
		});
		this.pending = operation.catch(() => undefined);
		return operation;
	}
}

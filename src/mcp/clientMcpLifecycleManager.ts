export interface ClientMcpLifecycleDependencies {
	getHealth(): Promise<unknown>;
	start(): Promise<void>;
	stop(): Promise<void>;
	setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
	clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

const defaultIdleTimeoutMs = 60_000;

export class ClientMcpLifecycleManager {
	private activeCalls = 0;
	private idleTimer?: ReturnType<typeof setTimeout>;
	private startPromise?: Promise<void>;
	private startedByUs = false;

	public constructor(
		private readonly dependencies: ClientMcpLifecycleDependencies,
		private readonly idleTimeoutMs = defaultIdleTimeoutMs,
	) {}

	public async run<T>(action: () => Promise<T>): Promise<T> {
		this.cancelIdleStop();
		await this.ensureRunning();
		this.activeCalls += 1;
		try {
			return await action();
		} finally {
			this.activeCalls -= 1;
			this.scheduleIdleStop();
		}
	}

	private async ensureRunning(): Promise<void> {
		if (await this.isRunning()) { return; }
		if (!this.startPromise) {
			this.startPromise = this.startAndWait().finally(() => { this.startPromise = undefined; });
		}
		await this.startPromise;
	}

	private async startAndWait(): Promise<void> {
		await this.dependencies.start();
		for (let attempt = 0; attempt < 10; attempt += 1) {
			if (await this.isRunning()) {
				this.startedByUs = true;
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		throw new Error('Client MCP was started, but its health endpoint did not become available.');
	}

	private async isRunning(): Promise<boolean> {
		try {
			await this.dependencies.getHealth();
			return true;
		} catch {
			return false;
		}
	}

	private scheduleIdleStop(): void {
		if (!this.startedByUs || this.activeCalls > 0) { return; }
		this.cancelIdleStop();
		this.idleTimer = this.dependencies.setTimer(() => {
			this.idleTimer = undefined;
			if (this.activeCalls > 0 || !this.startedByUs) { return; }
			void this.dependencies.stop()
				.then(() => { this.startedByUs = false; })
				.catch(() => undefined);
		}, this.idleTimeoutMs);
		this.idleTimer.unref?.();
	}

	private cancelIdleStop(): void {
		if (!this.idleTimer) { return; }
		this.dependencies.clearTimer(this.idleTimer);
		this.idleTimer = undefined;
	}
}

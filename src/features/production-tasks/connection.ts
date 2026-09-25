import * as net from 'node:net';
import type { ProductionTasksLogger } from './models';
import { expectedPacketLength, readOenpError } from './oenpProtocol';

export const protocolTimeoutMs = 15_000;

export async function exchangeLogged(connection: OenpConnection, request: Buffer, stage: string, logger?: ProductionTasksLogger, includeResponseHead = true, timeoutMs = protocolTimeoutMs): Promise<Buffer> {
	const requestId = request.readUInt32LE(8);
	const startedAt = Date.now();
	logger?.info(`OENP: отправлен этап «${stage}».`, { requestId, requestBytes: request.length });
	try {
		const response = await connection.exchange(request, timeoutMs);
		logger?.info(`OENP: получен ответ на этап «${stage}».`, {
			requestId, responseRequestId: response.length >= 12 ? response.readUInt32LE(8) : undefined,
			responseBytes: response.length, packetType: response.length >= 13 ? response[12] : undefined,
			hasDataSet: response.includes(Buffer.from('MemoryDataPacket', 'ascii')),
			responseHead: includeResponseHead ? response.subarray(0, Math.min(response.length, 64)).toString('hex') : '<скрыто для авторизации>',
			elapsedMs: Date.now() - startedAt,
		});
		if (response.length >= 13 && response[12] === 5) {
			throw new Error(readOenpError(response) || `Сервер OENP вернул исключение на этапе «${stage}».`);
		}
		return response;
	} catch (error) {
		logger?.error(`OENP: обмен завершился ошибкой на этапе «${stage}».`, { requestId, ...errorDetails(error), elapsedMs: Date.now() - startedAt });
		throw error;
	}
}

export function errorDetails(error: unknown): { name?: string; message: string; code?: string; stack?: string } {
	if (!(error instanceof Error)) { return { message: String(error) }; }
	const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
	return { name: error.name, message: error.message, code, stack: error.stack };
}

export class OenpConnection {
	private socket?: net.Socket;
	private pending = Buffer.alloc(0);
	constructor(private readonly host: string, private readonly port: number) {}
	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const socket = net.createConnection({ host: this.host, port: this.port });
			this.socket = socket;
			socket.setTimeout(protocolTimeoutMs);
			socket.once('connect', resolve);
			socket.once('error', reject);
			socket.once('timeout', () => reject(new Error(`Тайм-аут подключения к ${this.host}:${this.port}.`)));
		});
	}
	exchange(request: Buffer, timeoutMs = protocolTimeoutMs): Promise<Buffer> {
		const socket = this.socket;
		if (!socket) { return Promise.reject(new Error('Соединение OENP не открыто.')); }
		return new Promise((resolve, reject) => {
			socket.setTimeout(timeoutMs);
			let required = 0;
			const cleanup = () => { socket.off('data', onData); socket.off('error', onError); socket.off('timeout', onTimeout); };
			const onError = (error: Error) => { cleanup(); reject(error); };
			const onTimeout = () => onError(new Error('Сервер Восточного Экспресса не ответил вовремя.'));
			const onData = (chunk: Buffer) => {
				this.pending = Buffer.concat([this.pending, chunk]);
				if (!required && this.pending.length >= 8) { required = expectedPacketLength(this.pending); }
				if (required && this.pending.length >= required) {
					const response = this.pending.subarray(0, required);
					this.pending = this.pending.subarray(required);
					cleanup(); resolve(response);
				}
			};
			socket.on('data', onData); socket.once('error', onError); socket.once('timeout', onTimeout);
			socket.write(request);
		});
	}
	dispose(): void { this.socket?.destroy(); this.socket = undefined; }
}

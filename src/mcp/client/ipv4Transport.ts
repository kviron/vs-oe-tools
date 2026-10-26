import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/** Uses IPv4 only for localhost, preserving Host (and TLS identity) for the native listener. */
export function fetchLocalClientMcp(url: URL, preferIPv4: boolean, timeoutMs: number, maximumBytes: number): Promise<Response> {
	const signal = AbortSignal.timeout(timeoutMs);
	const headers = { accept: 'application/json' };
	if (!preferIPv4 || url.hostname !== 'localhost') {
		return fetch(url, { headers, signal });
	}
	return new Promise<Response>((resolve, reject) => {
		const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, { family: 4, agent: false, headers, signal }, response => {
			const chunks: Buffer[] = [];
			let bytes = 0;
			response.on('error', reject);
			response.on('data', (chunk: Buffer) => {
				bytes += chunk.length;
				if (bytes > maximumBytes) {
					const error = new Error(`Ответ клиентского MCP превышает ${maximumBytes} байт.`);
					reject(error);
					request.destroy(error);
					return;
				}
				chunks.push(chunk);
			});
			response.on('end', () => {
				const responseHeaders = new Headers();
				for (const [name, value] of Object.entries(response.headers)) {
					if (value !== undefined) {
						for (const item of Array.isArray(value) ? value : [value]) { responseHeaders.append(name, item); }
					}
				}
				const status = response.statusCode ?? 500;
				resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks).toString('utf8'), {
					status, statusText: response.statusMessage, headers: responseHeaders,
				}));
			});
		});
		request.on('error', reject);
		request.end();
	});
}

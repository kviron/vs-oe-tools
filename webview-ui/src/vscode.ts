import type { WebviewMessage } from '../../src/core/webviewProtocol';
interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
export const vscode = acquireVsCodeApi();

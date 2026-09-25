import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import type { ProductionTaskDescriptionPart } from './models';

interface Picture {
	format?: 'png' | 'jpeg' | 'wmf';
	hex: string;
	width?: number;
	height?: number;
}

interface ParserState {
	destination: 'text' | 'skip' | 'picture';
	uc: number;
	unicodeFallback: number;
	ignorable: boolean;
	picture?: Picture;
	pictureOwner: boolean;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	color?: string;
}

function readColorTable(rtf: string): Array<string | undefined> {
	const table = rtf.match(/\{\\colortbl\b([^}]*)\}/i)?.[1];
	if (!table) { return []; }
	return table.split(';').slice(0, 256).map(entry => {
		const red = entry.match(/\\red(\d+)/i)?.[1];
		const green = entry.match(/\\green(\d+)/i)?.[1];
		const blue = entry.match(/\\blue(\d+)/i)?.[1];
		if (red === undefined || green === undefined || blue === undefined) { return undefined; }
		const components = [red, green, blue].map(Number);
		return components.every(value => value >= 0 && value <= 255)
			? `#${components.map(value => value.toString(16).padStart(2, '0')).join('')}` : undefined;
	});
}

const skippedDestinations = new Set([
	'fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'listtable', 'listoverridetable',
	'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'object', 'objdata',
	'field', 'fldinst', 'annotation', 'xmlnstbl', 'datastore', 'themedata', 'colorschememapping',
]);

const specialCharacters: Record<string, string> = {
	par: '\n', line: '\n', tab: '\t', emdash: '—', endash: '–', bullet: '•',
	lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', enspace: ' ', emspace: ' ', qmspace: ' ',
};

/**
 * Reads the text and supported embedded pictures produced by the
 * native wRichEdit. Styling is returned as data so the webview can render
 * escaped text without injecting RTF or HTML into the document.
 */
export function parseProductionTaskRichDescription(rtf: string): ProductionTaskDescriptionPart[] {
	if (!/^\s*\{\\rtf\d/i.test(rtf)) { return []; }
	const parts: ProductionTaskDescriptionPart[] = [];
	const colors = readColorTable(rtf);
	let text = '';
	let imageCount = 0;
	const root: ParserState = { destination: 'text', uc: 1, unicodeFallback: 0, ignorable: false, pictureOwner: false };
	const stack: ParserState[] = [root];
	const state = () => stack[stack.length - 1];
	const flushText = () => {
		if (text) {
			const { bold, italic, underline, strike, color } = state();
			parts.push({ kind: 'text', text, ...(bold && { bold }), ...(italic && { italic }), ...(underline && { underline }), ...(strike && { strike }), ...(color && { color }) });
			text = '';
		}
	};
	const appendText = (value: string) => {
		const current = state();
		if (current.destination !== 'text') { return; }
		if (current.unicodeFallback > 0) { current.unicodeFallback -= 1; return; }
		text += value;
	};
	const finishPicture = (picture: Picture | undefined) => {
		if (!picture?.format || imageCount >= 20) { return; }
		const hex = picture.hex.replace(/\s+/g, '');
		if (!hex || hex.length % 2 !== 0 || !/^[\da-f]+$/i.test(hex) || hex.length > 16_000_000) { return; }
		const bytes = Buffer.from(hex, 'hex');
		const valid = picture.format === 'png'
			? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
			: picture.format === 'jpeg'
				? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
				: bytes.length >= 18 && (bytes.subarray(0, 4).equals(Buffer.from('d7cdc69a', 'hex'))
					|| bytes.subarray(0, 4).equals(Buffer.from('01000900', 'hex')));
		if (!valid) { return; }
		flushText();
		parts.push({
			kind: 'image',
			dataUrl: `data:image/${picture.format === 'wmf' ? 'x-wmf' : picture.format};base64,${bytes.toString('base64')}`,
			width: picture.width,
			height: picture.height,
		});
		imageCount += 1;
	};

	for (let offset = 0; offset < rtf.length;) {
		const char = rtf[offset];
		if (char === '{') {
			flushText();
			const parent = state();
			stack.push({ ...parent, pictureOwner: false });
			offset += 1;
			continue;
		}
		if (char === '}') {
			const current = state();
			if (current.pictureOwner) { finishPicture(current.picture); }
			else { flushText(); }
			if (stack.length > 1) { stack.pop(); }
			offset += 1;
			continue;
		}
		if (char !== '\\') {
			const current = state();
			if (current.destination === 'picture') {
				if (/[\da-f\s]/i.test(char)) { current.picture!.hex += char; }
			} else if (char !== '\r' && char !== '\n') {
				appendText(char);
			}
			offset += 1;
			continue;
		}

		offset += 1;
		if (offset >= rtf.length) { break; }
		const symbol = rtf[offset];
		if (symbol === '\\' || symbol === '{' || symbol === '}') {
			appendText(symbol); offset += 1; continue;
		}
		if (symbol === '~') { appendText('\u00a0'); offset += 1; continue; }
		if (symbol === '-') { appendText('\u00ad'); offset += 1; continue; }
		if (symbol === '_') { appendText('\u2011'); offset += 1; continue; }
		if (symbol === '*') { state().ignorable = true; offset += 1; continue; }
		if (symbol === "'") {
			const hex = rtf.slice(offset + 1, offset + 3);
			if (/^[\da-f]{2}$/i.test(hex)) { appendText(iconv.decode(Buffer.from(hex, 'hex'), 'win1251')); offset += 3; }
			else { offset += 1; }
			continue;
		}
		if (!/[a-z]/i.test(symbol)) { offset += 1; continue; }

		const wordStart = offset;
		while (offset < rtf.length && /[a-z]/i.test(rtf[offset])) { offset += 1; }
		const word = rtf.slice(wordStart, offset).toLowerCase();
		let sign = 1;
		if (rtf[offset] === '-') { sign = -1; offset += 1; }
		const numberStart = offset;
		while (offset < rtf.length && /\d/.test(rtf[offset])) { offset += 1; }
		const parameter = offset > numberStart ? sign * Number(rtf.slice(numberStart, offset)) : undefined;
		if (rtf[offset] === ' ') { offset += 1; }
		const current = state();

		if (word === 'pict') {
			current.destination = 'picture';
			current.ignorable = false;
			current.picture = { hex: '' };
			current.pictureOwner = true;
			continue;
		}
		if (current.destination === 'picture') {
			if (word === 'pngblip') { current.picture!.format = 'png'; }
			else if (word === 'jpegblip') { current.picture!.format = 'jpeg'; }
			else if (word === 'wmetafile') { current.picture!.format = 'wmf'; }
			else if (word === 'picwgoal' && parameter && parameter > 0) { current.picture!.width = Math.round(parameter / 15); }
			else if (word === 'pichgoal' && parameter && parameter > 0) { current.picture!.height = Math.round(parameter / 15); }
			else if (word === 'bin' && parameter && parameter > 0) {
				const bytes = Buffer.from([...rtf.slice(offset, offset + parameter)].map(value => value.charCodeAt(0) & 0xff));
				current.picture!.hex += bytes.toString('hex');
				offset += parameter;
			}
			continue;
		}
		if (word === 'shppict') { current.ignorable = false; continue; }
		if (word === 'nonshppict' || skippedDestinations.has(word) || current.ignorable) {
			current.destination = 'skip';
			continue;
		}
		if (word === 'uc' && parameter !== undefined) { current.uc = Math.max(0, parameter); continue; }
		if (word === 'u' && parameter !== undefined) {
			appendText(String.fromCharCode(parameter < 0 ? parameter + 0x10000 : parameter));
			current.unicodeFallback = current.uc;
			continue;
		}
		if (word === 'b' || word === 'i' || word === 'ul' || word === 'ulnone' || word === 'strike' || word === 'cf' || word === 'plain') {
			flushText();
			if (word === 'b') { current.bold = parameter !== 0; }
			else if (word === 'i') { current.italic = parameter !== 0; }
			else if (word === 'ul') { current.underline = parameter !== 0; }
			else if (word === 'ulnone') { current.underline = false; }
			else if (word === 'strike') { current.strike = parameter !== 0; }
			else if (word === 'cf') { current.color = parameter === undefined ? undefined : colors[parameter]; }
			else { current.bold = current.italic = current.underline = current.strike = false; current.color = undefined; }
			continue;
		}
		const special = specialCharacters[word];
		if (special) { appendText(special); }
	}
	flushText();
	return parts.filter(part => part.kind === 'image' || part.text.length > 0);
}

/** Converts Windows Metafile pictures through the Windows GDI+ renderer. */
export async function convertProductionTaskWmfImages(parts: ProductionTaskDescriptionPart[]): Promise<ProductionTaskDescriptionPart[]> {
	if (!parts.some(part => part.kind === 'image' && part.dataUrl.startsWith('data:image/x-wmf;base64,'))) { return parts; }
	const result: ProductionTaskDescriptionPart[] = [];
	const conversionErrors: string[] = [];
	for (const part of parts) {
		if (part.kind !== 'image' || !part.dataUrl.startsWith('data:image/x-wmf;base64,')) { result.push(part); continue; }
		try {
			result.push({ ...part, dataUrl: await convertWmfDataUrlToPng(part.dataUrl) });
		} catch (error) {
			// Browsers cannot render WMF. Dropping only that picture allows the caller
			// to fall back to Comment when no embedded picture could be converted.
			conversionErrors.push(error instanceof Error ? error.message : String(error));
		}
	}
	if (result.some(part => part.kind === 'image')) { return result; }
	if (conversionErrors.length) { throw new Error(`Не удалось преобразовать WMF: ${conversionErrors[0]}`); }
	return [];
}

async function convertWmfDataUrlToPng(dataUrl: string): Promise<string> {
	if (process.platform !== 'win32') { throw new Error('WMF conversion is available only on Windows.'); }
	const encoded = dataUrl.slice('data:image/x-wmf;base64,'.length);
	const bytes = Buffer.from(encoded, 'base64');
	if (bytes.length < 18 || bytes.length > 8_000_000) { throw new Error('Invalid WMF image size.'); }
	const directory = await mkdtemp(join(tmpdir(), 'vc-ve-tools-rich-image-'));
	const inputPath = join(directory, 'image.wmf');
	const outputPath = join(directory, 'image.png');
	const script = [
		'$OutputEncoding=[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
		'Add-Type -AssemblyName System.Drawing',
		'$source=[System.Drawing.Image]::FromFile($env:VC_VE_TOOLS_WMF_INPUT)',
		'try {',
		'  $scale=[Math]::Min(1.0,[Math]::Min(4096.0/[Math]::Max(1,$source.Width),4096.0/[Math]::Max(1,$source.Height)))',
		'  $width=[Math]::Max(1,[Math]::Round($source.Width*$scale)); $height=[Math]::Max(1,[Math]::Round($source.Height*$scale))',
		'  $bitmap=New-Object System.Drawing.Bitmap($width,$height)',
		'  try {',
		'    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)',
		'    try { $graphics.Clear([System.Drawing.Color]::White); $graphics.DrawImage($source,0,0,$bitmap.Width,$bitmap.Height) } finally { $graphics.Dispose() }',
		'    $bitmap.Save($env:VC_VE_TOOLS_WMF_OUTPUT,[System.Drawing.Imaging.ImageFormat]::Png)',
		'  } finally { $bitmap.Dispose() }',
		'} finally { $source.Dispose() }',
	].join('; ');
	try {
		await writeFile(inputPath, bytes);
		await runPowerShell(script, inputPath, outputPath);
		const png = await readFile(outputPath);
		if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) { throw new Error('GDI+ did not produce a PNG image.'); }
		return `data:image/png;base64,${png.toString('base64')}`;
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

function runPowerShell(script: string, inputPath: string, outputPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
			windowsHide: true,
			shell: false,
			stdio: ['ignore', 'ignore', 'pipe'],
			env: { ...process.env, VC_VE_TOOLS_WMF_INPUT: inputPath, VC_VE_TOOLS_WMF_OUTPUT: outputPath },
		});
		let stderr = '';
		const timer = setTimeout(() => { child.kill(); reject(new Error('WMF conversion timed out.')); }, 15_000);
		child.stderr.on('data', chunk => { stderr += String(chunk).slice(0, 2000); });
		child.once('error', error => { clearTimeout(timer); reject(error); });
		child.once('exit', code => {
			clearTimeout(timer);
			if (code === 0) { resolve(); }
			else { reject(new Error(stderr.trim() || `PowerShell exited with code ${code}.`)); }
		});
	});
}

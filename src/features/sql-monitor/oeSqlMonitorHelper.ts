import * as pty from 'node-pty';

const [, , executable, ...args] = process.argv;
if (!executable) {
	process.stderr.write('Не указан путь к OESQLMonCon.exe.\n');
	process.exit(2);
}

let terminal: pty.IPty | undefined;
let finished = false;

function stop(): void {
	if (finished || !terminal) { return; }
	try { terminal.write('\r'); } catch { /* The PTY has already exited. */ }
}

function fail(error: unknown): never {
	process.stderr.write(`${formatError(error)}\n`);
	process.exit(1);
}

try {
	terminal = pty.spawn(executable, args, {
		name: 'xterm-256color',
		cols: 120,
		rows: 30,
		cwd: process.cwd(),
		env: process.env,
		useConpty: true,
	});
	terminal.onData(data => process.stdout.write(data));
	terminal.onExit(({ exitCode }) => {
		finished = true;
		setTimeout(() => process.exit(exitCode), 50);
	});
	process.stdin.once('data', stop);
	setTimeout(stop, 1500);
	setTimeout(() => fail(new Error('OESQLMonCon не завершился за 8 секунд.')), 8000);
} catch (error) {
	fail(error);
}

function formatError(value: unknown): string {
	return value instanceof Error ? value.stack ?? value.message : String(value);
}

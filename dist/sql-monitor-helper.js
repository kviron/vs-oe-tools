"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/features/sql-monitor/oeSqlMonitorHelper.ts
var pty = __toESM(require("node-pty"));
var [, , executable, ...args] = process.argv;
if (!executable) {
  process.stderr.write("\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D \u043F\u0443\u0442\u044C \u043A OESQLMonCon.exe.\n");
  process.exit(2);
}
var terminal;
var finished = false;
function stop() {
  if (finished || !terminal) {
    return;
  }
  try {
    terminal.write("\r");
  } catch {
  }
}
function fail(error) {
  process.stderr.write(`${formatError(error)}
`);
  process.exit(1);
}
try {
  terminal = pty.spawn(executable, args, {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: process.env,
    useConpty: true
  });
  terminal.onData((data) => process.stdout.write(data));
  terminal.onExit(({ exitCode }) => {
    finished = true;
    setTimeout(() => process.exit(exitCode), 50);
  });
  process.stdin.once("data", stop);
  setTimeout(stop, 1500);
  setTimeout(() => fail(new Error("OESQLMonCon \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0441\u044F \u0437\u0430 8 \u0441\u0435\u043A\u0443\u043D\u0434.")), 8e3);
} catch (error) {
  fail(error);
}
function formatError(value) {
  return value instanceof Error ? value.stack ?? value.message : String(value);
}
//# sourceMappingURL=sql-monitor-helper.js.map

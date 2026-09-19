import * as readline from "readline";
export function promptText(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
/** Prompts for a value without echoing it back to the terminal (for API keys). */
export function promptSecret(question) {
    return new Promise((resolve) => {
        const output = process.stdout;
        const input = process.stdin;
        output.write(question);
        input.setRawMode?.(true);
        input.resume();
        input.setEncoding("utf8");
        let value = "";
        const onData = (char) => {
            const code = char.charCodeAt(0);
            if (char === "\n" || char === "\r" || code === 4) {
                input.setRawMode?.(false);
                input.pause();
                input.removeListener("data", onData);
                output.write("\n");
                resolve(value.trim());
                return;
            }
            if (code === 3) {
                // Ctrl+C
                output.write("\n");
                process.exit(1);
            }
            if (code === 127 || code === 8) {
                // backspace
                value = value.slice(0, -1);
                return;
            }
            value += char;
        };
        input.on("data", onData);
    });
}

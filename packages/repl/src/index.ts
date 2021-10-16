/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createCompiler } from "@macrojs/compiler";
import * as monaco from "monaco-editor/esm/vs/editor/editor.main";

(globalThis as any).MonacoEnvironment = {
    getWorkerUrl(_moduleId: any, label: string) {
        if (label === "typescript" || label === "javascript") {
            return "./ts.worker.js";
        }
        return "./editor.worker.js";
    },
};

function debounce(func: (...args: any[]) => any, timeout = 300) {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            func(...args);
        }, timeout);
    };
}

function createEditor(id: string, value: string) {
    return monaco.editor.create(document.getElementById(id)!, {
        value,
        language: "javascript",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        scrollbar: { vertical: "hidden" },
        scrollBeyondLastLine: false,
        inlayHints: { enabled: false },
        folding: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 3,
    });
}

const input = `
// input

macro swap {
    ($a:ident, $b:ident) => {
        let tmp = $a;
        $a = $b;
        $b = tmp;
    }
}

macro doTwice {
    ($($statements:stmt);) => {
        // do them once
        $($statements);

        // do them again
        $($statements);
    }
}

let foo = 1, bar = 2;
swap(foo, bar);

doTwice(
    console.log("first");
    console.log("second");
);
`.trim();

monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
});
const inputEditor = createEditor("input-container", `${input}\n`);

monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
});
const outputEditor = createEditor("output-container", "");

outputEditor.updateOptions({
    readOnly: true,
});

function compile() {
    try {
        const compiler = createCompiler();
        const content = inputEditor.getValue();
        const ast = compiler.parseProgram(content);
        const compiled = compiler.compile(ast);
        const result = compiler.codegen(compiled);

        const text = `// output\n\n${result.code}`;
        outputEditor.setValue(text);
    } catch (e) {
        outputEditor.setValue(String(e));
    }
}

inputEditor.onDidChangeModelContent(debounce(() => compile()));
compile();

import { createCompiler } from "@macrojs/compiler";
import fs from "fs";

const src = `
macro foo {
    ($val:expr) => {
        $val / 2
    }
}
foo((1 + 2) * 3);
foo(bar(1).baz);
`;

const compiler = createCompiler();
const ast = compiler.parseProgram(src);
const transformed = compiler.compile(ast);
fs.writeFileSync("out.json", JSON.stringify(transformed, null, 4));
const out = compiler.codegen(transformed);

console.log(out);

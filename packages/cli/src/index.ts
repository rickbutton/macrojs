import { createCompiler } from "@macrojs/compiler";
import fs from "fs";

const src = `

macro foo {
    (a:literal) => {
        foo(a, a)
    }
    (a:literal, b:literal) => {
        foo(a, a, b)
    }
    (a:literal, b:literal, c:literal) => {
        console.log(a * b * c)
    }
}

macro bar {
    (a:ident) => {
        export const a = 4;
    }
}

foo(1, 2, 3);
bar(baz);
foo(9);
console.log("in expr: " + foo(1234));


`;

const compiler = createCompiler();

const ast = compiler.parse(src, {});
const transformed = compiler.compile(ast);
fs.writeFileSync("out.json", JSON.stringify(transformed, null, 4));
const out = compiler.codegen(transformed);

console.log(out);

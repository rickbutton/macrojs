import { createCompiler } from "@macrojs/compiler";

const src = `

macro foo {
    (a:literal) => {
        foo(a, a);
    }
    (a:literal, b:literal) => {
        foo(a, a, b);
    }
    (a:literal, b:literal, c:literal) => {
        console.log(a * b * c);
    }
}

macro bar {
    (a:literal) => {
        foo(a, a, a);
    }
}

foo(1, 2, 3);
bar(7);
foo(9);


`;

const compiler = createCompiler();

const ast = compiler.parse(src, {});
const transformed = compiler.compile(ast);
const out = compiler.codegen(transformed);

console.log(out);

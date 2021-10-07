import { createCompiler } from "@macrojs/compiler";
import fs from "fs";

const src = `

macro foo {
    ($a:literal) => {
        foo($a, $a)
    }
    ($a:literal, $b:literal) => {
        foo($a, $a, $b)
    }
    ($a:literal, $b:literal, $c:literal) => {
        console.log($a * $b * $c)
    }
}

macro bar {
    ($a:ident) => {
        export const $a = 4;
    }
}

macro literal {
    (ONE) => {
        console.log("one")
    }
    (TWO) => {
        console.log("two")
    }
}

macro swap {
    ($a:expr => $b:expr) => {
        console.log($b, $a)
    }
}

macro make {
    ($name:ident : $expr:expr) => {
        ({ $name: ($expr) })
    }
    ($name:literal : $expr:expr) => {
        ({ [$name]: ($expr) })
    }
}

console.log(make(foo: 1 + 2));
console.log(make( "BAZ" : 3 * 4));
`;

const compiler = createCompiler();
const ast = compiler.parseProgram(src, {});
const transformed = compiler.compile(ast);
fs.writeFileSync("out.json", JSON.stringify(transformed, null, 4));
const out = compiler.codegen(transformed);

console.log(out);

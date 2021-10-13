import { createCompiler } from "@macrojs/compiler";
import fs from "fs";

const _OG = `

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

const src = `
macro of {
    (for (const $val:ident of $expr:expr) {
        $($stmt:stmt);
    }) => {
        let e = $expr;
        for (let i = 0; i < e.length; i++) {
            let $val = e[i];
            $($stmt);
        }
    }
}

const ARR = [[1,2], [3,4], [5,6]];
of(for (const pair of ARR) {
    of(for (const num of pair) {
        console.log(num);
    });
});
`;

const compiler = createCompiler();
const ast = compiler.parseProgram(src);
const transformed = compiler.compile(ast);
fs.writeFileSync("out.json", JSON.stringify(transformed, null, 4));
const out = compiler.codegen(transformed);

console.log(out);

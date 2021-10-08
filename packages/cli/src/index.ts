import { createCompiler } from "@macrojs/compiler";
import fs from "fs";

const OG = `

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

macro set_and_log_foo {
    ($e:expr) => {
        let foo = $e;
        console.log(foo);
    }
}
macro decl {
    ($name:ident) => {
        let $name;
    }
}
macro set {
    ($name:ident = $e:expr) => {
        $name = $e;
    }
}
macro set_bar {
    ($e:expr) => {
        bar = $e;
    }
}

// foo in runtime phase
let foo = 1;

// creates a new foo
// in the macro's phase
// and logs it
set_and_log_foo(2);

// creates a new bar
// but with a name from
// the runtime phase
decl(bar);
// set the same name
// using the same "bar"
set(bar = 1);
// finally, log said bar
console.log(bar);

// wrong bar!
set_bar(2);
`;

const compiler = createCompiler();
const ast = compiler.parseProgram(src, {});
const transformed = compiler.compile(ast);
fs.writeFileSync("out.json", JSON.stringify(transformed, null, 4));
const out = compiler.codegen(transformed);

console.log(out);

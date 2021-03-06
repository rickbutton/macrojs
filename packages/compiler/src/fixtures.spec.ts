import "jest";
import type { CodeGenResult } from "./context";
import { createCompiler } from "./index";

type Fixture = [string, string, string | null];
const fixtures: Fixture[] = [
    [
        // name
        "smoke tests",
        // input
        `macro foo {
            (one) => {
                one;
            }
            (one, two) => {
                one;
                two;
            }
            (1 = 2) => {
                three;
            }
        }
        foo(one);
        foo(one, two);
        foo(1 = 2);
        `,
        // expected
        `
        one;
        one;
        two;
        three;
        `,
    ],
    [
        // name
        "match a literal token",
        // input
        `macro foo {
            (123) => {
                456;
            }
        }
        foo(123);`,
        // expected
        "456",
    ],
    [
        // name
        "capture literal",
        // input
        `macro foo {
            ($val:literal) => {
                $val + 123;
            }
        }
        foo(123);
        foo(123n);
        foo("bar");
        foo(null);
        foo(undefined);
        foo(true);
        foo(false);
        foo(/match/);
        `,
        // expected
        `
        123 + 123;
        123n + 123;
        "bar" + 123;
        null + 123;
        undefined + 123;
        true + 123;
        false + 123;
        /match/ + 123;
        `,
    ],
    [
        // name
        "capture expressions",
        // input
        `macro foo {
            ($val:expr) => {
                $val / 2
            }
        }
        foo((1 + 2) * 3);
        foo(bar(1).baz);
        `,
        // expected
        `
        ((1 + 2) * 3) / 2;
        bar(1).baz / 2;
        `,
    ],
    [
        // name
        "capture identifiers",
        // input
        `
        macro foo {
            ($name:ident) => {
                let $name = 1;
            }
        }
        foo(bar);
        foo(baz);
        `,
        // expected
        `
        let bar = 1;
        let baz = 1;
        `,
    ],
    [
        // name
        "identifiers bound in macro phase are hygienic",
        // input
        `
        macro foo {
            ($name:ident) => {
                let $name = 1;
                let two = 2;
            }
        }
        foo(bar);
        foo(baz);
        `,
        // expected
        `
        let bar = 1;
        let two_1 = 2;
        let baz = 1;
        let two_2 = 2;
        `,
    ],
    [
        // name
        "basic repetition",
        // input
        `macro add {
            ($arg:literal) => {
                $arg
            }
            ($first:literal, $($rest:literal),) => {
                $first + add($($rest),);
            }
        }
        add(1, 2, 3);`,
        // expected
        `1 + (2 + 3);`,
    ],
    [
        // name
        "a nested for loop",
        // input
        `macro of {
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
        const ARR = [[1,1]];
        of(for (const pair of ARR) {
            of(for (const num of pair) {
                console.log(num);
            });
        });`,
        // expected
        `const ARR = [[1, 1]];
         let e_1 = ARR;
         
         for (let i_1 = 0; i_1 < e_1.length; i_1++) {
             let pair = e_1[i_1];
             let e_2 = pair;
         
             for (let i_2 = 0; i_2 < e_2.length; i_2++) {
                 let num = e_2[i_2];
                 console.log(num);
             }
         }`,
    ],
];

function normalize(src: string): CodeGenResult {
    const compiler = createCompiler();
    const ast = compiler.parseProgram(src);
    return compiler.codegen(ast);
}

test.each(fixtures)("%s", (_name: string, input: string, expected: string | null) => {
    const compiler = createCompiler();

    let actual: string | Error;
    try {
        const ast = compiler.parseProgram(input);
        const transformed = compiler.compile(ast);
        actual = compiler.codegen(transformed).code;
    } catch (e) {
        actual = e as Error;
    }

    const normalized = expected ? normalize(expected) : null;
    if (normalized !== null) {
        expect(actual).toEqual(normalized.code);
    } else {
        expect(actual).toBeInstanceOf(Error);
    }
});

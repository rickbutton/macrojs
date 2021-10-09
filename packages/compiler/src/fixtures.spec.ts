import "jest";
import { createCompiler } from "./index";

type Fixture = [string, string, string | null];
const fixtures: Fixture[] = [
    [
        // name
        "smoke tests",
        // input
        `macro foo {
            () => {
                empty
            }
            (one) => {
                one;
            }
            (one, two) => {
                one;
                two;
            }
        }
        foo();
        foo(one);
        foo(one, two);
        `,
        // expected
        `
        empty;
        one;
        one;
        two;
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
];

function normalize(src: string): string {
    const compiler = createCompiler();
    const ast = compiler.parseProgram(src, {});
    return compiler.codegen(ast);
}

test.each(fixtures)("%s", (_name: string, input: string, expected: string | null) => {
    const compiler = createCompiler();

    let actual: string | Error;
    try {
        const ast = compiler.parseProgram(input, {});
        const transformed = compiler.compile(ast);
        actual = compiler.codegen(transformed);
    } catch (e) {
        actual = e as Error;
    }

    const normalized = expected ? normalize(expected) : null;
    if (typeof normalized === "string") {
        expect(actual).toEqual(normalized);
    } else {
        expect(actual).toBeInstanceOf(Error);
    }
});
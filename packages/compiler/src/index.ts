import * as recast from "recast";
import { setupAstTypes, MacroInvocation } from "./types";
import { MacroParser } from "./parser";
import { Expander } from "./expander";
import type { namedTypes } from "ast-types";
import type { Context, ParseHooks } from "./context";
import type { Token } from "acorn";

setupAstTypes();

function parse(context: Context, src: string | Token[], hooks: ParseHooks): namedTypes.Program {
    return MacroParser.parse(context, src, hooks);
}

function compile(context: Context, ast: namedTypes.Program): namedTypes.Program {
    return recast.visit(ast, {
        visitMacroDeclaration(path: any) {
            path.replace();
            return false;
        },
        visitMacroInvocation(path: any) {
            const node: MacroInvocation = path.node;

            const expander = new Expander(node, context);
            const expansion = expander.expand();

            path.replace();
            if (expansion.success) {
                const compiled = compile(context, expansion.program);

                for (const stmt of compiled.body) {
                    path.insertAfter(stmt);
                }
                this.traverse(path);
            } else {
                throw new Error("FIXME handle macro expansion failure: " + expansion.diagnostic);
            }
        },
    } as any);
}

function codegen(_context: Context, ast: namedTypes.Node): string {
    return recast.print(ast).code;
}

export function createCompiler(): Context {
    const context: Context = {} as Context;

    context.parse = parse.bind(null, context);
    context.compile = compile.bind(null, context);
    context.codegen = codegen.bind(null, context);

    return context as Context;
}

import * as recast from "recast";
import { setupAstTypes, MacroInvocation, MacroArgumentExpression } from "./types";
import { MacroParser } from "./parser";
import { Expander } from "./expander";
import { namedTypes, builders } from "ast-types";
import type { Context, ParseHooks } from "./context";
import type { Token } from "acorn";

setupAstTypes();

function parseProgram(context: Context, src: string | Token[], hooks: ParseHooks): namedTypes.Program {
    return MacroParser.parseProgram(context, src, hooks);
}

function parseMacroArgumentExpression(context: Context, src: string | Token[], hooks: ParseHooks): MacroArgumentExpression {
    return MacroParser.parseMacroArgumentExpression(context, src, hooks);
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

            const inStatementPosition = namedTypes.ExpressionStatement.check(path.parent.node);

            if (expansion.success) {
                const compiled = compile(context, expansion.program);
                const body = compiled.body;

                if (body.length === 0) {
                    throw new Error("macro returned no results");
                } else if (!inStatementPosition) {
                    // expression position
                    if (body.length !== 1) {
                        throw new Error("macro attempted to expand multiple statements into expression position");
                    }
                    const stmt = body[0];

                    if (!namedTypes.ExpressionStatement.check(stmt)) {
                        throw new Error("macro attempted to expand statement into expression position");
                    }

                    const expr = stmt.expression;

                    path.replace(expr);

                    this.traverse(path);
                } else {
                    const stmt = path.parent;
                    const bodyContainer = stmt.parent;

                    for (let i = body.length - 1; i >= 0; i--) {
                        if (i === 0) {
                            stmt.replace(body[i]);
                        } else {
                            stmt.insertAfter(body[i]);
                        }
                    }

                    this.traverse(bodyContainer)
                }
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

    context.parseProgram = parseProgram.bind(null, context);
    context.parseMacroArgumentExpression = parseMacroArgumentExpression.bind(null, context);
    context.compile = compile.bind(null, context);
    context.codegen = codegen.bind(null, context);

    return context as Context;
}

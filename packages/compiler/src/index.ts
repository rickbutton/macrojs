/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as recast from "recast";
import { setupAstTypes, MacroInvocation, MacroArgumentExpression, MacroDeclaration } from "./types";
import { MacroParser } from "./parser";
import { Expander } from "./expander";
import { namedTypes } from "ast-types";
import type { Context, ParseHooks } from "./context";
import type { Token } from "acorn";
import { ExpansionError } from "./error";

setupAstTypes();

function parseProgram(context: Context, src: string | Token[], hooks: ParseHooks): namedTypes.Program {
    return MacroParser.parseProgram(context, src, hooks);
}

function parseMacroArgumentExpression(
    context: Context,
    src: string | Token[],
    hooks: ParseHooks
): MacroArgumentExpression {
    return MacroParser.parseMacroArgumentExpression(context, src, hooks);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodePath<_T> = any;

function compile(context: Context, ast: namedTypes.Program): namedTypes.Program {
    return recast.visit(ast, {
        visitMacroDeclaration(path: NodePath<MacroDeclaration>) {
            path.replace();
            return false;
        },
        visitMacroInvocation(path: NodePath<MacroInvocation>) {
            const node: MacroInvocation = path.node;

            const expander = new Expander(node, context);
            const expansion = expander.expand();

            const inStatementPosition = namedTypes.ExpressionStatement.check(path.parent.node);

            const compiled = compile(context, expansion);
            const body = compiled.body;

            if (body.length === 0) {
                throw ExpansionError.fromInvocation(node, "macro expansion yielded no expressions or statements");
            } else if (!inStatementPosition) {
                // expression position
                if (body.length !== 1) {
                    throw ExpansionError.fromInvocation(
                        node,
                        "macro attempted to expand multiple statements into expression position"
                    );
                }
                const stmt = body[0];

                if (!namedTypes.ExpressionStatement.check(stmt)) {
                    throw ExpansionError.fromInvocation(node, "macro attempted to expand statement into expression position");
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

                this.traverse(bodyContainer);
            }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as namedTypes.Program;
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

    return context;
}

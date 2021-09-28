import * as recast from "recast";
import { setupAstTypes, MacroInvocation } from "./types";
import { MacroParser } from "./parser";
import { Expander } from "./expander";
import { namedTypes, builders } from "ast-types";
import type { Context, ParseHooks } from "./context";
import type { Token } from "acorn";

setupAstTypes();

function parse(context: Context, src: string | Token[], hooks: ParseHooks): namedTypes.Program {
    return MacroParser.parse(context, src, hooks);
}

function unwrapMaybeExpressionStatement(node: namedTypes.Node): namedTypes.Node {
    if (namedTypes.ExpressionStatement.check(node)) {
        return node.expression;
    } else {
        return node;
    }
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

                if (compiled.body.length === 0) {
                    throw new Error("macro returned no results");
                } else if (!inStatementPosition && compiled.body.length !== 1) {
                    throw new Error("macro returned multiple results in expression position");
                } else if (!inStatementPosition && 
                           !(namedTypes.ExpressionStatement.check(compiled.body[0]) ||
                             namedTypes.Expression.check(compiled.body[0]))) {
                    throw new Error("macro returned a non-expression in an expression position");
                } else {
                    const replacement = compiled.body.map(unwrapMaybeExpressionStatement);
                    if (inStatementPosition && replacement.every(r => namedTypes.Statement.check(r))) {
                        path.parent.replace(...replacement);
                        this.traverse(path.parent);
                    } else {
                        path.replace(...replacement);
                        this.traverse(path);
                    }
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

    context.parse = parse.bind(null, context);
    context.compile = compile.bind(null, context);
    context.codegen = codegen.bind(null, context);

    return context as Context;
}

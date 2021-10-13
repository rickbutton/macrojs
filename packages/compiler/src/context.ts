import type { namedTypes } from "ast-types";
import type { Token } from "acorn";
import { MacroInvocation, Scope } from "./types";
import { InternalCompilerError } from "./error";

type Node = namedTypes.Node;
type Program = namedTypes.Program;
type Expression = namedTypes.Expression;
type Statement = namedTypes.Statement;

export interface ParseContext {
    registerIdentifier: (token: Token, id: namedTypes.Identifier) => void;
    getScopeStackForIdentifier: (id: namedTypes.Identifier) => Scope[];
    getColorForIdentifier: (id: namedTypes.Identifier) => string | null;
}

export interface CompilerContext {
    parseProgram(src: string | Token[], pctx?: ParseContext): Program;
    parseMacroArgumentExpression(
        src: string | Token[],
        pctx?: ParseContext
    ): { expression: Expression; tokens: Token[] };
    parseStatement(src: string | Token[], pctx?: ParseContext): { statement: Statement; tokens: Token[] };
    compile(ast: Program): Program;
    codegen(ast: Node): string;
}

let COLOR = 1;
export function createParserContextForExpansion(invocation: MacroInvocation): ParseContext {
    const identifierToToken = new WeakMap<namedTypes.Identifier, Token>();
    const inMacroScope: Set<Token> = new Set(MacroInvocation.getTokensInMacroScope(invocation));
    let color: number | null = null;

    const pctx: ParseContext = {
        registerIdentifier: (token: Token, id: namedTypes.Identifier) => {
            identifierToToken.set(id, token);
        },
        getScopeStackForIdentifier: (id: namedTypes.Identifier): Scope[] => {
            const token = identifierToToken.get(id);
            if (!token) {
                throw new InternalCompilerError("could not trace identifier to original token context");
            }

            if (inMacroScope.has(token)) {
                return invocation.macro.scopeStack;
            } else {
                return invocation.scopeStack;
            }
        },
        getColorForIdentifier: (id: namedTypes.Identifier): string | null => {
            const token = identifierToToken.get(id);
            if (!token) {
                throw new InternalCompilerError("could not trace identifier to original token context");
            }

            if (inMacroScope.has(token)) {
                if (!color) {
                    color = COLOR++;
                }
                return String(color);
            } else {
                return null;
            }
        },
    };
    return pctx;
}

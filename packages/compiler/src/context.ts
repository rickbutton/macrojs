import type { namedTypes } from "ast-types";
import type { Token } from "acorn";
import type { Scope } from "./types";

type Node = namedTypes.Node;
type Program = namedTypes.Program;
type Expression = namedTypes.Expression;

export interface ParseHooks {
    registerIdentifier?: (token: Token, id: namedTypes.Identifier) => void;
    getScopeStackForIdentifier?: (id: namedTypes.Identifier) => Scope[];
    getColorForIdentifier?: (id: namedTypes.Identifier) => string | null;
}

export interface Context {
    parseProgram(src: string | Token[], hooks: ParseHooks): Program;
    parseMacroArgumentExpression(src: string | Token[], hooks: ParseHooks): { expression: Expression; tokens: Token[] };
    compile(ast: Program): Program;
    codegen(ast: Node): string;
}

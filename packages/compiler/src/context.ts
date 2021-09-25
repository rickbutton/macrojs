import type { namedTypes } from "ast-types";
import type { Token } from "acorn";
import type { Scope } from "./types";

type Node = namedTypes.Node;
type Program = namedTypes.Program;

export interface ParseHooks {
    getScopeStackForToken?: (token: Token) => Scope[];
}

export interface Context {
    parse(src: string | Token[], hooks: ParseHooks): Program;
    compile(ast: Program): Program;
    codegen(ast: Node): string;
}

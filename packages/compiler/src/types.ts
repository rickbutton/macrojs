import type { Token } from "acorn";
import { Type, finalize, namedTypes } from "ast-types";

export interface Scope {
    lexical: string[];
    macros: {
        [name: string]: MacroDeclaration;
    }
};

// approximation of ast-types equivalent types for new AST nodes
export interface MacroBody extends Omit<namedTypes.Node, "type"> {
    type: "MacroBody";
    tokens: Token[];
}

export interface MacroPatternVariable extends Omit<namedTypes.Node, "type"> {
    type: "MacroPatternVariable";
    name: namedTypes.Identifier;
    kind: "literal" | "ident" | "expr";
}
export interface MacroPatternLiteral extends Omit<namedTypes.Node, "type"> {
    type: "MacroPatternLiteral";
    token: Token;
}

export type MacroPatternArgument = MacroPatternVariable | MacroPatternLiteral;
export interface MacroPattern extends Omit<namedTypes.Node, "type"> {
    type: "MacroPattern";
    arguments: MacroPatternArgument[];
    body: MacroBody;
}
export interface MacroDeclaration extends Omit<namedTypes.Statement, "type"> {
    type: "MacroDeclaration";
    id: namedTypes.Identifier;
    patterns: MacroPattern[];
    scopeStack: Scope[];
}
export interface MacroInvocation extends Omit<namedTypes.Expression, "type"> {
    type: "MacroInvocation";
    id: namedTypes.Identifier;
    tokens: Token[];
    macro: MacroDeclaration;
    scopeStack: Scope[];
}

export interface MacroArgumentExpression extends Omit<namedTypes.Expression, "type"> {
    type: "MacroArgumentExpression";
    expression: namedTypes.Expression;
    tokens: Token[];
}

export interface SuccessExpansionResult {
    success: true;
    program: namedTypes.Program;
}
export interface FailureExpansionResult {
    success: false;
    diagnostic: string;
}
export type ExpansionResult = SuccessExpansionResult | FailureExpansionResult;

export function setupAstTypes() {
    // dynamic generation of macrojs AST code for ast-types
    Type.def("MacroBody")
    .build("tokens")
    .field("tokens", [Object]);

    Type.def("MacroPatternVariable")
    .build("name", "kind")
    .field("name", Type.def("Identifier"))
    .field("kind", Type.or("literal", "ident"));

    Type.def("MacroPatternLiteral")
    .build("token")
    .field("token", Object);

    Type.def("MacroPattern")
    .build("arguments", "body")
    .field("arguments",
           Type.or(Type.def("MacroPatternVariable"),
                   Type.def("MacroPatternLiteral")))
    .field("body", [Type.def("MacroBody")]);

    Type.def("MacroDeclaration")
    .bases("Statement")
    .build("id", "patterns", "scopeStack")
    .field("id", Type.def("Identifier"))
    .field("patterns", [Type.def("MacroPattern")])
    .field("scopeStack", [Object])

    Type.def("MacroInvocation")
    .bases("Expression")
    .build("id", "tokens", "macro", "scopeStack")
    .field("id", Type.def("Identifier"))
    .field("tokens", [Object])
    .field("macro", Object)
    .field("scopeStack", [Object]);

    Type.def("MacroArgumentExpression")
    .bases("Expression")
    .build("expression", "tokens")
    .field("expression", Type.def("Expression"))
    .field("tokens", [Object])

    finalize();

}

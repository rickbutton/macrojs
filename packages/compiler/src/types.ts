/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Token, TokenType } from "acorn";
import { Type, finalize, namedTypes } from "ast-types";

export interface Scope {
    lexical: string[];
    vars: string[];
    functions: string[];
    macros?: {
        [name: string]: MacroDeclaration;
    };
    colors?: {
        [name: string]: string | null;
    };
}

// approximation of ast-types equivalent types for new AST nodes
export interface MacroBody extends Omit<namedTypes.Node, "type"> {
    type: "MacroBody";
    tokens: Token[];
}

export interface MacroPatternVariable extends Omit<namedTypes.Node, "type"> {
    type: "MacroPatternVariable";
    name: namedTypes.Identifier;
    kind: "literal" | "ident" | "expr" | "stmt";
}
export interface MacroPatternLiteral extends Omit<namedTypes.Node, "type"> {
    type: "MacroPatternLiteral";
    token: Token;
}
export interface MacroPatternRepetition extends Omit<namedTypes.Node, "type"> {
    type: "MacroPatternRepetition";
    content: MacroPatternArgument[];
    separator: Token;
}

export type MacroPatternArgument = MacroPatternVariable | MacroPatternLiteral | MacroPatternRepetition;
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

export interface MacroArgumentStatement extends Omit<namedTypes.Statement, "type"> {
    type: "MacroArgumentStatement";
    statement: namedTypes.Statement;
    tokens: Token[];
}

export function setupAstTypes(): void {
    // dynamic generation of macrojs AST code for ast-types
    Type.def("MacroBody").build("tokens").field("tokens", [Object]);

    Type.def("MacroPatternVariable")
        .build("name", "kind")
        .field("name", Type.def("Identifier"))
        .field("kind", Type.or("literal", "ident"));

    Type.def("MacroPatternLiteral").build("token").field("token", Object);

    Type.def("MacroPattern")
        .build("arguments", "body")
        .field("arguments", Type.or(Type.def("MacroPatternVariable"), Type.def("MacroPatternLiteral")))
        .field("body", [Type.def("MacroBody")]);

    Type.def("MacroDeclaration")
        .bases("Statement")
        .build("id", "patterns", "scopeStack")
        .field("id", Type.def("Identifier"))
        .field("patterns", [Type.def("MacroPattern")])
        .field("scopeStack", [Object]);

    Type.def("MacroInvocation")
        .bases("Expression")
        .build("id", "tokens", "macro", "scopeStack")
        .field("id", Type.def("Identifier"))
        .field("tokens", [Object])
        .field("macro", Object)
        .field("scopeStack", [Object]);

    Type.def("MacroArgumentStatement")
        .bases("Statement")
        .build("statement", "tokens")
        .field("statement", Type.def("Statement"))
        .field("tokens", [Object]);

    Type.def("MacroArgumentExpression")
        .bases("Expression")
        .build("expression", "tokens")
        .field("expression", Type.def("Expression"))
        .field("tokens", [Object]);

    finalize();
}

export const MacroBody = {
    getTokensInMacroScope(term: MacroBody): Token[] {
        return term.tokens.slice();
    },
};
export const MacroPatternArgument = {
    getTokensInMacroScope(term: MacroPatternArgument): Token[] {
        if (term.type === "MacroPatternLiteral") {
            return [term.token];
        } else if (term.type === "MacroPatternRepetition") {
            return [...term.content.map((c) => MacroPatternArgument.getTokensInMacroScope(c)).flat(), term.separator];
        } else {
            return [];
        }
    },
};
export const MacroPattern = {
    getTokensInMacroScope(term: MacroPattern): Token[] {
        return [
            ...term.arguments.map((a) => MacroPatternArgument.getTokensInMacroScope(a)).flat(),
            ...MacroBody.getTokensInMacroScope(term.body),
        ];
    },
};
export const MacroDeclaration = {
    getTokensInMacroScope(term: MacroDeclaration): Token[] {
        return term.patterns.map((p) => MacroPattern.getTokensInMacroScope(p)).flat();
    },
};
export const MacroInvocation = {
    getTokensInMacroScope(term: MacroInvocation): Token[] {
        return [...MacroDeclaration.getTokensInMacroScope(term.macro)];
    },
};

export function makeToken(ctx: Token, type: TokenType, value: any): Token {
    const token = new Token({
        type: type,
        start: ctx.start,
        end: ctx.end,
        loc: ctx.loc,
        range: ctx.range,
        value,
        options: {},
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (token as any).input = "";
    return token;
}
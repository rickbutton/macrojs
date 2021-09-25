import { Parser, Token, TokenType, tokTypes } from "acorn";
import { namedTypes } from "ast-types";
import type { Context, ParseHooks } from "./context";
import { BIND_LEXICAL } from "./scope";
import type { MacroDeclaration, Scope } from "./types";

export function registerMacro(scope: Scope, macro: MacroDeclaration) {
    if (!scope.macros) {
        scope.macros = {};
    }
    scope.macros[macro.id.name] = macro;
}

export function findMacroInScope(scopeStack: Scope[], name: string): MacroDeclaration | null {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
        const scope = scopeStack[i];
        if (scope?.macros && scope.macros[name]) {
            const macro = scope.macros[name];
            return macro || null;
        }
    }
    return null;
}

const MACRO_TOKEN = new TokenType("macro", { keyword: "macro" });
export class MacroParser extends (Parser as any) {

    ctx: Context;
    srcTokens: Token[] | null = null;
    allTokens: Token[] = [];
    comments: any[] = [];
    hooks: ParseHooks;

    constructor(context: Context, src: string | Token[], hooks: ParseHooks) {
        super({
            ecmaVersion: "latest",
            locations: true,
            onComment: (c: any) => this.comments.push(c),
            onToken: (t: Token) => {
                return this.allTokens.push(t);
            },
        }, typeof src === "string" ? src : "    ");
        this.ctx = context;

        if (Array.isArray(src)) {
            this.srcTokens = src.slice();
        }
        this.hooks = hooks;
    }

    parse(): namedTypes.Program {
        const ast = super.parse();
        ast.tokens = this.allTokens;
        ast.comments = this.comments;

        return ast;
    }

    static parse(context: Context, src: string | Token[], hooks: ParseHooks) {
        return new MacroParser(context, src, hooks).parse();
    }

    finishToken(type: TokenType, word: string): any {
        if (type.label === "name" && word === "macro") {
            return super.finishToken(MACRO_TOKEN, word);
        } else {
            return super.finishToken(type, word);
        }
    }

    readToken(code: any) {
        const token = this.srcTokens?.shift();
        if (token) {
            const prevType = this.type;

            this.start = token.start;
            this.end = token.end;
            this.startLoc = token.loc?.start;
            this.endLoc = token.loc?.end;
            this.type = token.type;
            this.value = token.value;

            this.updateContext(prevType);

            if (this.hooks.getScopeStackForToken) {
                this.scopeStack = this.hooks.getScopeStackForToken(token);
            }

        } else if (this.srcTokens) {
            this.type = tokTypes.eof;
            this.value = undefined;
        } else {
            return super.readToken(code);
        }
    }

    skipSpace() {
        if (!this.srcTokens) {
            super.skipSpace();
        }
    }

    // todo: allow macro in expression position
    parseStatement(context: any, topLevel: unknown, exps: unknown) {
        if (this.type === MACRO_TOKEN) {
            return this.parseMacroDeclaration();
        } else {
            return super.parseStatement(context, topLevel, exps);
        }
    }
    parseMacroDeclaration() {
        let node = this.startNode();

        // skip 'macro'
        this.next();

        // macro name
        node.id = this.parseIdent();
        this.checkLValSimple(node.id, BIND_LEXICAL, false);

        this.expect(tokTypes.braceL);

        node.patterns = [];
        while (this.type !== tokTypes.braceR) {
            const pattern = this.parseMacroPattern();
            node.patterns.push(pattern);
        }

        node.scopeStack = this.scopeStack.slice();

        this.expect(tokTypes.braceR);

        this.finishNode(node, "MacroDeclaration");

        registerMacro(this.currentScope(), node)
        return node;
    }
    parseMacroPattern() {
        const node = this.startNode();

        this.expect(tokTypes.parenL);

        node.matches = [];
        if (this.type !== tokTypes.parenR) {

            let done = false;
            while (!done) {
                const match = this.parseMacroMatch();
                node.matches.push(match);

                if (this.type === tokTypes.comma) {
                    this.next();
                }

                if (this.type === tokTypes.parenR) {
                    done = true;
                }
            }
        }
        this.expect(tokTypes.parenR);

        this.expect(tokTypes.arrow);

        this.expect(tokTypes.braceL);

        node.body = this.parseMacroBody();

        return this.finishNode(node, "MacroPattern");
    }
    parseMacroMatch() {
        const node = this.startNode();

        node.name = this.parseIdent();

        this.expect(tokTypes.colon);

        node.kind = this.parseIdent();

        return this.finishNode(node, "MacroMatch");
    }
    parseMacroBody() {
        const node = this.startNode();
        const tokens = this.parseTokenTree(tokTypes.braceR);
        node.tokens = tokens;
        return this.finishNode(node, "MacroBody");
    }
    parseTokenTree(endGroupTok: TokenType): Token[] {
        const tokens = [];
        let stack = [endGroupTok];
        while (stack.length > 0 && this.type != tokTypes.eof) {
            const top = stack[stack.length - 1];

            if (this.type === top) {
                stack.pop();
                if (stack.length > 0) {
                    tokens.push(new Token(this as any));
                }
            } else if (this.type === tokTypes.braceL) {
                stack.push(tokTypes.braceR);
                tokens.push(new Token(this as any));
            } else if (this.type === tokTypes.parenL) {
                stack.push(tokTypes.parenR);
                tokens.push(new Token(this as any));
            } else if (this.type === tokTypes.bracketL) {
                stack.push(tokTypes.bracketR);
                tokens.push(new Token(this as any));
            } else if (this.type === tokTypes.braceR ||
                       this.type === tokTypes.parenR ||
                       this.type === tokTypes.bracketR) {
                throw new Error("fixme");
            } else {
                tokens.push(new Token(this as any));
            }
            this.next();
        }

        if (stack.length > 0) {
            throw new Error("fixme unbalanced");
        }

        return tokens;
    }
    parseSubscripts(base: any, startPos: any, startLoc: any, noCalls: any, forInit: any) {
        const macro = findMacroInScope(this.scopeStack, base.name);
        if (namedTypes.Identifier.check(base) && this.type === tokTypes.parenL && macro) {
            const node = this.startNodeAt((base as any).start, (base as any).loc.start);
            this.next();

            node.id = base;
            const tokens = this.parseTokenTree(tokTypes.parenR);
            node.macro = macro;
            node.tokens = tokens;
            node.scopeStack = this.scopeStack.slice();

            return this.finishNode(node, "MacroInvocation")
        } else {
            return super.parseSubscripts(base, startPos, startLoc, noCalls, forInit);
        }
    }
    parseExpressionStatement(node: any, expr: any) {
        const stmt: namedTypes.ExpressionStatement =
            super.parseExpressionStatement(node, expr);

        if ((stmt.expression.type) as any === "MacroInvocation") {
            return stmt.expression;
        } else {
            return stmt;
        }
    }
}

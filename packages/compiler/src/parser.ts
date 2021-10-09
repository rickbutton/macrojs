/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import acorn, { Parser, Position, Token, TokenType, tokTypes } from "acorn";
import { namedTypes } from "ast-types";
import type { Context, ParseHooks } from "./context";
import { InternalCompilerError } from "./error";
import { BIND_LEXICAL } from "./scope";
import type {
    MacroArgumentExpression,
    MacroBody,
    MacroDeclaration,
    MacroPattern,
    MacroPatternArgument,
    Scope,
} from "./types";

function registerMacro(scope: Scope, macro: MacroDeclaration) {
    if (!scope.macros) {
        scope.macros = {};
    }
    scope.macros[macro.id.name] = macro;
}

function findMacroInScope(scopeStack: Scope[], name: string): MacroDeclaration | null {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
        const scope = scopeStack[i];
        if (scope?.macros && scope.macros[name]) {
            const macro = scope.macros[name];
            return macro || null;
        }
    }
    return null;
}

function markColor(scope: Scope, name: string, color: string | null) {
    if (!scope.colors) {
        scope.colors = {};
    }
    scope.colors[name] = color;
}

function findColorForIdentiferInScope(scopeStack: Scope[], id: namedTypes.Identifier): string | null {
    for (let i = 0; i < scopeStack.length; i++) {
        const scope = scopeStack[i];
        if (scope?.colors && id.name in scope.colors) {
            return scope.colors[id.name] || null;
        }
    }
    return null;
}

const MACRO_TOKEN = new TokenType("macro", { keyword: "macro" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParserAny = any;
declare class BaseParser extends Parser {
    startNode(): ParserAny;
    nextToken(): void;
    parseMaybeAssign(): ParserAny;
    finishNode(...args: ParserAny[]): namedTypes.Node;
    finishToken(...args: ParserAny[]): ParserAny;
    updateContext(prevType: ParserAny): ParserAny;
    readToken(code: ParserAny): void;
    skipSpace(): void;
    parseStatement(context: ParserAny, topLevel: ParserAny, exps: ParserAny): ParserAny;
    next(): void;
    expect(type: ParserAny): void;
    parseSubscripts(
        base: ParserAny,
        startPos: ParserAny,
        startLoc: ParserAny,
        noCalls: ParserAny,
        forInit: ParserAny
    ): ParserAny;
    parseIdent(...args: ParserAny[]): namedTypes.Identifier;
    currentScope(): Scope;
    checkLValSimple(id: namedTypes.Identifier, bindingType: ParserAny, checkClases: ParserAny): void;
    startNodeAt(start: ParserAny, loc: ParserAny): ParserAny;
    isContextual(name: string): boolean;
    isLet(context: ParserAny): boolean;
    raise(pos: number, message: string): void;
    unexpected(): void;

    type: ParserAny;
    start: number | Position;
    end: number | Position;
    startLoc?: acorn.Position;
    endLoc?: acorn.Position;
    value: ParserAny;
    scopeStack: Scope[];
}
export class MacroParser extends (Parser as ParserAny as typeof BaseParser) {
    ctx: Context;
    srcTokens: {
        current: Token[];
        all: Token[];
    } | null = null;
    lastToken: Token | null = null;
    allTokens: Token[] = [];
    comments: ParserAny[] = [];
    hooks: ParseHooks;

    protected constructor(context: Context, src: string | Token[], hooks: ParseHooks) {
        super(
            {
                ecmaVersion: "latest",
                sourceType: "module",
                locations: true,
                onComment: (c: ParserAny) => this.comments.push(c),
                onToken: (t: Token) => {
                    return this.allTokens.push(t);
                },
            },
            typeof src === "string" ? src : "    "
        );
        this.ctx = context;

        if (Array.isArray(src)) {
            this.srcTokens = {
                current: src.slice(),
                all: src,
            };
        }
        this.hooks = hooks;
    }

    override parse(): acorn.Node {
        const ast = super.parse();
        (ast as ParserAny).tokens = this.allTokens;
        (ast as ParserAny).comments = this.comments;

        return ast as ParserAny as acorn.Node;
    }

    static parseProgram(context: Context, src: string | Token[], hooks: ParseHooks): namedTypes.Program {
        return new MacroParser(context, src, hooks).parse() as ParserAny as namedTypes.Program;
    }

    static parseMacroArgumentExpression(
        context: Context,
        src: string | Token[],
        hooks: ParseHooks
    ): MacroArgumentExpression {
        const parser = new MacroParser(context, src, hooks);

        const node = parser.startNode();
        parser.nextToken();
        node.expression = parser.parseMaybeAssign();
        node.tokens = parser.allTokens;

        return parser.finishNode(node, "MacroArgumentExpression") as ParserAny as MacroArgumentExpression;
    }

    override finishToken(type: TokenType, word: string): ParserAny {
        if (type.label === "name" && word === "macro") {
            return super.finishToken(MACRO_TOKEN, word);
        } else {
            return super.finishToken(type, word);
        }
    }

    override readToken(code: ParserAny): void {
        const token = this.srcTokens?.current.shift();
        if (token) {
            this.lastToken = token;

            const prevType = this.type;

            this.start = token.loc?.start || token.start;
            this.end = token.loc?.end || token.end;
            this.startLoc = token.loc?.start;
            this.endLoc = token.loc?.end;
            this.type = token.type;
            this.value = token.value;

            this.updateContext(prevType);
        } else if (this.srcTokens) {
            this.type = tokTypes.eof;
            this.value = undefined;
        } else {
            return super.readToken(code);
        }
    }

    override skipSpace(): void {
        if (!this.srcTokens) {
            super.skipSpace();
        }
    }

    override parseStatement(context: ParserAny, topLevel: ParserAny, exps: ParserAny): ParserAny {
        if (this.type === MACRO_TOKEN) {
            return this.parseMacroDeclaration();
        } else {
            return super.parseStatement(context, topLevel, exps);
        }
    }
    parseMacroDeclaration(this: MacroParser): MacroDeclaration {
        const node = this.startNode();

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

        registerMacro(this.currentScope(), node);
        return node as MacroDeclaration;
    }
    parseMacroPattern(): MacroPattern {
        const node = this.startNode();

        this.expect(tokTypes.parenL);

        node.arguments = [];
        if (this.type !== tokTypes.parenR) {
            let done = false;
            while (!done) {
                const arg = this.parseMacroArgument();
                node.arguments.push(arg);

                if (this.type === tokTypes.parenR) {
                    done = true;
                }
            }
        }
        this.expect(tokTypes.parenR);

        this.expect(tokTypes.arrow);

        this.expect(tokTypes.braceL);

        node.body = this.parseMacroBody();

        return this.finishNode(node, "MacroPattern") as ParserAny as MacroPattern;
    }
    parseMacroArgument(): MacroPatternArgument {
        const node = this.startNode();

        const name = String(this.value);
        if (this.type === tokTypes.name && name.startsWith("$")) {
            node.name = this.parseIdent();

            this.expect(tokTypes.colon);

            const kind = this.value;
            this.expect(tokTypes.name);

            if (kind === "literal" || kind === "ident" || kind === "expr") {
                node.kind = kind;
            } else {
                this.raise(node.start, `capturing macro argument has invalid kind '${String(kind)}'`);
            }

            return this.finishNode(node, "MacroPatternVariable") as ParserAny as MacroPatternArgument;
        } else {
            node.token = new Token(this as ParserAny);
            this.next();
            return this.finishNode(node, "MacroPatternLiteral") as ParserAny as MacroPatternArgument;
        }
    }
    parseMacroBody(): MacroBody {
        const node = this.startNode();
        const tokens = this.parseTokenTree(tokTypes.braceR);
        node.tokens = tokens;
        return this.finishNode(node, "MacroBody") as ParserAny as MacroBody;
    }
    parseTokenTree(endGroupTok: TokenType): Token[] {
        const tokens = [];
        const stack = [endGroupTok];
        while (stack.length > 0 && this.type != tokTypes.eof) {
            const top = stack[stack.length - 1];

            if (this.type === top) {
                stack.pop();
                if (stack.length > 0) {
                    tokens.push(new Token(this as ParserAny));
                }
            } else if (this.type === tokTypes.braceL) {
                stack.push(tokTypes.braceR);
                tokens.push(new Token(this as ParserAny));
            } else if (this.type === tokTypes.parenL) {
                stack.push(tokTypes.parenR);
                tokens.push(new Token(this as ParserAny));
            } else if (this.type === tokTypes.bracketL) {
                stack.push(tokTypes.bracketR);
                tokens.push(new Token(this as ParserAny));
            } else if (
                this.type === tokTypes.braceR ||
                this.type === tokTypes.parenR ||
                this.type === tokTypes.bracketR
            ) {
                this.unexpected();
            } else {
                tokens.push(new Token(this as ParserAny));
            }
            this.next();
        }

        if (stack.length > 0) {
            const top = stack[stack.length - 1];
            this.raise(this.start, `expected ${top?.label ?? "<unk>"}`);
        }

        return tokens;
    }
    override parseSubscripts(
        base: ParserAny,
        startPos: ParserAny,
        startLoc: ParserAny,
        noCalls: ParserAny,
        forInit: ParserAny
    ): ParserAny {
        const macro = findMacroInScope(this.scopeStack, base.name);
        if (namedTypes.Identifier.check(base) && this.type === tokTypes.parenL && macro) {
            const node = this.startNodeAt((base as ParserAny).start, (base as ParserAny).loc.start);
            this.next();

            node.id = base;
            const tokens = this.parseTokenTree(tokTypes.parenR);
            node.macro = macro;
            node.tokens = tokens;
            node.scopeStack = this.scopeStack.slice();

            return this.finishNode(node, "MacroInvocation");
        } else {
            if (namedTypes.Identifier.check(base)) {
                this.colorIdent(base);
            }

            return super.parseSubscripts(base, startPos, startLoc, noCalls, forInit);
        }
    }

    private colorIdent(ident: namedTypes.Identifier) {
        if (this.hooks.getScopeStackForIdentifier && this.hooks.getColorForIdentifier) {
            const scopeStack = this.hooks.getScopeStackForIdentifier(ident);

            const color = findColorForIdentiferInScope(scopeStack, ident);
            if (color) {
                ident.name = `${ident.name}_${color}`;
            }
        }
    }

    override checkLValSimple(expr: ParserAny, bindingType: ParserAny, checkClashes: ParserAny): void {
        const oldScopeStack = this.scopeStack;

        if (namedTypes.Identifier.check(expr)) {
            if (this.hooks.getScopeStackForIdentifier) {
                this.scopeStack = this.hooks.getScopeStackForIdentifier(expr);
            }

            if (this.hooks.getColorForIdentifier) {
                const color = this.hooks.getColorForIdentifier(expr);
                markColor(this.currentScope(), expr.name, color);
            }

            this.colorIdent(expr);
        }

        const result = super.checkLValSimple(expr, bindingType, checkClashes);
        this.scopeStack = oldScopeStack;
        return result;
    }

    override isLet(context: ParserAny): boolean {
        if (this.srcTokens) {
            return this.isContextual("let");
        } else {
            return super.isLet(context);
        }
    }

    override parseIdent(...args: Parser[]): namedTypes.Identifier {
        const token = this.lastToken;
        const id = super.parseIdent(...args);
        if (token && this.hooks.registerIdentifier) {
            this.hooks.registerIdentifier(token, id);
        }
        return id;
    }

    override raise(pos: ParserAny, message: string): void {
        if (this.srcTokens) {
            const tokens = this.srcTokens.all;

            let token = null;
            for (let i = 0; i < tokens.length; i++) {
                if (tokens[i]?.start ?? Number.MAX_SAFE_INTEGER <= pos) {
                    token = tokens[i];
                }
            }

            if (!token || !token.loc) {
                throw new InternalCompilerError("expected token to have a location");
            }

            if (typeof pos === "number") {
                throw new InternalCompilerError("expected number");
            }
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            const withLoc = `${message} (${pos.line}:${pos.column})`;
            const error = new SyntaxError(withLoc);
            (error as ParserAny).pos = 0;
            (error as ParserAny).loc = pos;
            throw error;
        } else {
            return super.raise(pos, message);
        }
    }
}

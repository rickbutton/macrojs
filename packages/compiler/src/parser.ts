/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import acorn, { Parser, Position, Token, TokenType, tokTypes } from "acorn";
import { namedTypes } from "ast-types";
import type { CompilerContext, ParseContext } from "./context";
import { InternalCompilerError } from "./error";
import { BIND_LEXICAL } from "./scope";
import { consumeTokenTree } from "./tokentree";
import type {
    MacroArgumentExpression,
    MacroArgumentStatement,
    MacroBody,
    MacroDeclaration,
    MacroPattern,
    MacroPatternArgument,
    MacroPatternRepetition,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParserAny = any;
declare class BaseParser extends Parser {
    startNode(): ParserAny;
    nextToken(): void;
    parseMaybeAssign(): ParserAny;
    finishNode(node: ParserAny, type: string): namedTypes.Node;
    finishToken(...args: ParserAny[]): ParserAny;
    updateContext(prevType: ParserAny): ParserAny;
    readToken(code: ParserAny): void;
    skipSpace(): void;
    parseStatement(context: ParserAny, topLevel: ParserAny, exps: ParserAny): ParserAny;
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
    raise(pos: number, message: string): never;
    unexpected(): never;
    next(ignoreEscape?: boolean): void;

    type: ParserAny;
    start: number | Position;
    end: number | Position;
    startLoc?: acorn.Position;
    endLoc?: acorn.Position;
    value: ParserAny;
    scopeStack: Scope[];
}
export class MacroParser extends (Parser as ParserAny as typeof BaseParser) {
    ctx: CompilerContext;
    srcTokens: {
        current: Token[];
        all: Token[];
    } | null = null;
    lastToken: Token = this.createToken();
    allTokens: Token[] = [];
    comments: ParserAny[] = [];
    pctx: ParseContext | null;

    protected constructor(context: CompilerContext, src: string | Token[], pctx?: ParseContext) {
        super(
            {
                ecmaVersion: "latest",
                sourceType: "module",
                locations: true,
                onComment: (c: ParserAny) => this.comments.push(c),
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
        this.pctx = pctx || null;
    }

    override parse(): acorn.Node {
        const ast = super.parse();
        (ast as ParserAny).tokens = this.allTokens;
        (ast as ParserAny).comments = this.comments;

        return ast as ParserAny as acorn.Node;
    }

    static parseProgram(context: CompilerContext, src: string | Token[], pctx?: ParseContext): namedTypes.Program {
        return new MacroParser(context, src, pctx).parse() as ParserAny as namedTypes.Program;
    }

    static parseMacroArgumentExpression(
        context: CompilerContext,
        src: string | Token[],
        pctx?: ParseContext
    ): MacroArgumentExpression {
        const parser = new MacroParser(context, src, pctx);

        const node = parser.startNode();
        parser.nextToken();
        node.expression = parser.parseMaybeAssign();
        node.tokens = [...parser.allTokens, parser.lastToken];

        return parser.finishNode(node, "MacroArgumentExpression") as ParserAny as MacroArgumentExpression;
    }

    static parseStatement(
        context: CompilerContext,
        src: string | Token[],
        pctx?: ParseContext
    ): MacroArgumentStatement {
        const parser = new MacroParser(context, src, pctx);

        const node = parser.startNode();
        parser.nextToken();
        node.statement = parser.parseStatement(null, true, Object.create(null));
        node.tokens = [...parser.allTokens, parser.lastToken];

        return parser.finishNode(node, "MacroArgumentStatement") as ParserAny as MacroArgumentStatement;
    }

    override readToken(code?: ParserAny): void {
        const token = this.srcTokens?.current.shift();
        if (token) {
            if (this.lastToken.type !== tokTypes.eof) {
                this.allTokens.push(this.lastToken);
            }
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
            this.lastToken = this.createToken();
            this.type = tokTypes.eof;
            this.value = undefined;
        } else {
            if (this.lastToken.type !== tokTypes.eof) {
                this.allTokens.push(this.lastToken);
            }
            super.readToken(code ?? (NaN as ParserAny));
            this.lastToken = this.createToken();
        }
    }

    nextAndRead(): Token {
        this.next();
        return this.lastToken;
    }

    override skipSpace(): void {
        if (!this.srcTokens) {
            super.skipSpace();
        }
    }

    override parseStatement(context: ParserAny, topLevel: ParserAny, exps: ParserAny): ParserAny {
        if (this.type === tokTypes.name && this.value === "macro") {
            return this.parseMacroDeclaration();
        } else {
            return super.parseStatement(context, topLevel, exps);
        }
    }

    override finishNode(node: ParserAny, type: string): namedTypes.Node {
        if (type === "Literal" && node.value === 0) {
            node.raw = "0";
        }

        return super.finishNode(node, type);
    }

    createToken(): Token {
        return new Token(this as ParserAny);
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
        const success = consumeTokenTree(tokTypes.parenR, () => {
            node.arguments.push(this.parseMacroArgument());
            return this.lastToken;
        });
        if (!success) {
            this.unexpected();
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
        if (this.type === tokTypes.name && name === "$") {
            this.next();
            this.expect(tokTypes.parenL);

            node.content = [];
            const success = consumeTokenTree(tokTypes.parenR, () => {
                node.content.push(this.parseMacroArgument());
                return this.lastToken;
            });
            if (!success) {
                this.unexpected();
            }

            this.expect(tokTypes.parenR);

            // todo restrict delimiter
            node.separator = this.lastToken;
            this.next();

            return this.finishNode(node, "MacroPatternRepetition") as ParserAny as MacroPatternRepetition;
        } else if (this.type === tokTypes.name && name.startsWith("$")) {
            node.name = this.parseIdent();

            this.expect(tokTypes.colon);

            const kind = this.value;
            this.expect(tokTypes.name);

            if (kind === "literal" || kind === "ident" || kind === "expr" || kind === "stmt") {
                node.kind = kind;
            } else {
                this.raise(node.start, `capturing macro argument has invalid kind '${String(kind)}'`);
            }

            return this.finishNode(node, "MacroPatternVariable") as ParserAny as MacroPatternArgument;
        } else {
            node.token = this.lastToken;
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
        const tokens = consumeTokenTree(endGroupTok, () => {
            const tok = this.lastToken;
            this.next();
            return tok;
        });

        if (!tokens) {
            this.unexpected();
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
        if (!namedTypes.Identifier.check(base)) {
            return super.parseSubscripts(base, startPos, startLoc, noCalls, forInit);
        }

        let macro: MacroDeclaration | null = null;
        if (this.pctx) {
            macro = findMacroInScope(this.pctx.getScopeStackForIdentifier(base), base.name);
        }
        if (!macro) {
            macro = findMacroInScope(this.scopeStack, base.name);
        }

        if (this.type === tokTypes.parenL && macro) {
            const node = this.startNodeAt((base as ParserAny).start, (base as ParserAny).loc.start);
            this.next();

            node.id = base;
            const tokens = this.parseTokenTree(tokTypes.parenR);
            node.macro = macro;
            node.tokens = tokens;
            node.scopeStack = this.scopeStack.slice();

            return this.finishNode(node, "MacroInvocation");
        }

        if (namedTypes.Identifier.check(base)) {
            this.colorIdent(base);
        }
        return super.parseSubscripts(base, startPos, startLoc, noCalls, forInit);
    }

    private colorIdent(ident: namedTypes.Identifier) {
        if (this.pctx && !(ident as ParserAny)._hasColor) {
            const scopeStack = this.pctx.getScopeStackForIdentifier(ident);

            const color = findColorForIdentiferInScope(scopeStack, ident);
            if (color) {
                ident.name = `${ident.name}_${color}`;
                (ident as ParserAny)._hasColor = true;
            }
        }
    }

    override checkLValSimple(expr: ParserAny, bindingType: ParserAny, checkClashes: ParserAny): void {
        const oldScopeStack = this.scopeStack;

        if (namedTypes.Identifier.check(expr)) {
            if (this.pctx) {
                this.scopeStack = this.pctx.getScopeStackForIdentifier(expr);
                const color = this.pctx.getColorForIdentifier(expr);
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
        if (token && this.pctx) {
            this.pctx.registerIdentifier(token, id);
        }
        return id;
    }

    override raise(pos: ParserAny, message: string): never {
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

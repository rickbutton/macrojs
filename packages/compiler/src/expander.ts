/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Token, TokenType, tokTypes } from "acorn";
import type { namedTypes } from "ast-types";
import { CompilerContext, createParserContextForExpansion, ParseContext } from "./context";
import { ExpansionError, InternalCompilerError } from "./error";
import { consumeTokenTree } from "./tokentree";
import { MacroBody, MacroDeclaration, MacroInvocation, MacroPattern, MacroPatternArgument, makeToken, Scope } from "./types";

function tokIsLiteral(tok: Token) {
    return (
        tok.type === tokTypes.num ||
        tok.type === tokTypes.string ||
        tok.type === tokTypes._null ||
        (tok.type === tokTypes.name && tok.value === "undefined") ||
        tok.type === tokTypes._true ||
        tok.type === tokTypes._false ||
        tok.type === tokTypes.regexp
    );
}
function tokIsIdent(tok: Token) {
    return tok.type === tokTypes.name;
}

interface Binding {
    tokens: Token[][];
    depth: number;
}
interface ExpansionEnvironment {
    [name: string]: Binding;
}

export class Expander {
    private macro: MacroDeclaration;
    private invocation: MacroInvocation;
    private context: CompilerContext;
    private idx = 0;
    private pctx: ParseContext;

    constructor(invocation: MacroInvocation, context: CompilerContext) {
        this.macro = invocation.macro;
        this.invocation = invocation;
        this.context = context;

        this.pctx = createParserContextForExpansion(invocation);
    }
    expand(): namedTypes.Program {
        for (const pattern of this.macro.patterns) {
            const result = this.tryPattern(pattern);

            if (result) {
                return result;
            }
        }

        throw ExpansionError.fromInvocation(this.invocation, "no matching patterns for invocation");
    }
    tryPattern(pattern: MacroPattern): namedTypes.Program | null {
        this.resetToken();

        const env: ExpansionEnvironment = {};
        // each match is a single "argument" to the pattern
        for (let i = 0; i < pattern.arguments.length; i++) {
            const arg = pattern.arguments[i];
            if (!this.tryPatternArgument(arg, env, 0)) {
                return null;
            }
        }

        const tok = this.currentToken();
        if (tok) {
            return null;
        }

        // try to expand body with bindings
        return this.tryMacroBody(pattern.body, env);
    }
    tryPatternArgument(args: MacroPatternArgument, env: ExpansionEnvironment, depth: number): boolean {
        const tok = this.currentToken();
        if (!tok) {
            return false;
        }

        if (args.type === "MacroPatternVariable") {
            if (args.kind === "literal" && tokIsLiteral(tok)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                //tok.value = (tok as any).realValue || tok.value;

                this.insertBinding(env, args.name, [tok], depth);
                this.nextToken();
                return true;
            } else if (args.kind === "ident" && tokIsIdent(tok)) {
                this.insertBinding(env, args.name, [tok], depth);
                this.nextToken();
                return true;
            } else if (args.kind === "expr") {
                const tokens = this.invocation.tokens.slice(this.idx);

                let argExpr;
                try {
                    argExpr = this.context.parseMacroArgumentExpression(tokens, this.pctx);
                } catch (e) {
                    // TODO: somehow indicate that this parse branch failed
                    return false;
                }

                this.idx += argExpr.tokens.length;

                const leftParen = makeToken(tok, tokTypes.parenL, undefined);
                const rightParen = makeToken(tok, tokTypes.parenR, undefined);
                this.insertBinding(env, args.name, [leftParen, ...argExpr.tokens, rightParen], depth);
                return true;
            } else if (args.kind === "stmt") {
                const tokens = this.invocation.tokens.slice(this.idx);
                let argsStmt;
                try {
                    argsStmt = this.context.parseStatement(tokens, this.pctx);
                } catch (e) {
                    // TODO: somehow indicate that this parse branch failed
                    return false;
                }

                this.idx += argsStmt.tokens.length;
                this.insertBinding(env, args.name, argsStmt.tokens, depth);
                return true;
            }
        } else if (args.type === "MacroPatternLiteral") {
            if (args.token.type === tok.type && args.token.value === tok.value) {
                this.nextToken();
                return true;
            }
        } else if (args.type === "MacroPatternRepetition") {
            let more = true;
            while (more) {
                for (const arg of args.content) {
                    if (!this.tryPatternArgument(arg, env, depth + 1)) {
                        more = false;
                    }
                }
                const cur = this.currentToken();
                const isSep = args.separator.type === cur?.type && args.separator.value === cur?.value;
                if (isSep) {
                    this.nextToken();
                }
            }
            return true;
        }

        return false;
    }
    tryMacroBody(body: MacroBody, env: ExpansionEnvironment): namedTypes.Program {
        const result = Array.from(this.expandMacroBodyTokenTree(body.tokens, env, new Set(), 0, 0));
        return this.context.parseProgram(result, this.pctx);
    }
    expandMacroBodyTokenTree = function* expandMacroBodyTokenTree(
        this: Expander,
        tokens: Token[],
        env: ExpansionEnvironment,
        usedNames: Set<string>,
        depth: number,
        repetition: number
    ): Generator<Token> {
        let maybeRep: Token | false = false;

        const arr = tokens.slice();
        let token: Token;
        while (arr.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            token = arr.shift()!;

            if (maybeRep) {
                if (token.type === tokTypes.parenL) {
                    maybeRep = false;

                    const repTokens = consumeTokenTree(tokTypes.parenR, () => {
                        return arr.shift() || null;
                    });

                    if (!repTokens) {
                        throw ExpansionError.fromInvocation(this.invocation, "unexpected token in tree");
                    }

                    // get separator
                    const sep = arr.shift();
                    if (!sep) {
                        throw ExpansionError.fromInvocation(this.invocation, "expected separator in body repetition");
                    }

                    const repUsedNames = new Set<string>();
                    for (const repResult of this.expandMacroBodyTokenTree(repTokens, env, repUsedNames, depth + 1, 0)) {
                        yield repResult;
                    }

                    if (repUsedNames.size === 0) {
                        throw ExpansionError.fromToken(
                            token,
                            this.invocation,
                            "repetition pattern does not use any pattern variables, so unable to determine how many repetitions to emit"
                        );
                    }

                    let realReps: number | null = null;
                    for (const name of repUsedNames) {
                        const reps = env[name].tokens.length;
                        if (realReps === null) {
                            realReps = reps;
                        }

                        if (realReps !== reps) {
                            throw ExpansionError.fromToken(
                                token,
                                this.invocation,
                                "pattern variables in repetition are captured different numbers of times"
                            );
                        }
                    }

                    if (realReps === null) {
                        throw new InternalCompilerError("realRep === null");
                    }

                    for (let i = 1; i < realReps; i++) {
                        if (i < realReps - 1) {
                            yield sep;
                        }

                        for (const repResult of this.expandMacroBodyTokenTree(
                            repTokens,
                            env,
                            repUsedNames,
                            depth + 1,
                            i
                        )) {
                            yield repResult;
                        }
                    }
                } else {
                    yield maybeRep;
                    maybeRep = false;
                    yield token;
                }
            } else if (token.type === tokTypes.name && token.value === "$") {
                maybeRep = token;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            } else if (token.type === tokTypes.name && token.value.startsWith("$")) {
                usedNames.add(token.value);
                for (const value of this.getBinding(env, token, depth, repetition)) {
                    yield value;
                }
            } else {
                yield token;
            }
        }
    };
    resetToken(idx = 0): void {
        this.idx = idx;
    }
    nextToken(): void {
        this.idx++;
    }
    currentToken(): Token | undefined {
        return this.invocation.tokens[this.idx];
    }
    expectToken(type: TokenType): void {
        if (this.matchToken(type)) {
            this.nextToken();
        } else {
            throw ExpansionError.fromToken(
                this.currentToken(),
                this.invocation,
                `unexpected token, expected ${type.label}`
            );
        }
    }
    eatToken(type: TokenType): boolean {
        if (this.matchToken(type)) {
            this.nextToken();
            return true;
        }
        return false;
    }
    matchToken(type: TokenType): boolean {
        const tok = this.currentToken();
        return Boolean(tok && tok.type === type);
    }
    insertBinding(env: ExpansionEnvironment, name: namedTypes.Identifier, tokens: Token[], depth: number): void {
        if (!env[name.name]) {
            env[name.name] = {
                tokens: [tokens],
                depth,
            };
        } else {
            const binding = env[name.name];
            if (binding.depth !== depth) {
                throw ExpansionError.fromIdentifier(
                    name,
                    this.invocation,
                    "attempted to use pattern variable at an incorrect nesting depth"
                );
            }

            binding.tokens.push(tokens);
        }
    }
    getBinding(env: ExpansionEnvironment, token: Token, depth: number, repetition: number): Token[] {
        const binding = env[token.value];
        if (!binding) {
            throw ExpansionError.fromToken(token, this.invocation, "use of unbound pattern variable");
        }

        if (binding.depth !== depth) {
            throw ExpansionError.fromToken(
                token,
                this.invocation,
                "attempted to expand pattern variable into multiple nesting depths"
            );
        }

        if (binding.tokens.length === 0) {
            throw new InternalCompilerError("???");
        }
        const tokens = binding.tokens[repetition];
        if (!tokens) {
            throw new InternalCompilerError("???");
        }
        return tokens;
    }
}

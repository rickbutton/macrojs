import { Token, TokenType, tokTypes } from "acorn";
import type { namedTypes } from "ast-types";
import type { Context, ParseHooks  } from "./context";
import type { ExpansionResult, MacroBody, MacroDeclaration, MacroInvocation, MacroPattern, MacroPatternArgument, Scope } from "./types";

function tokIsLiteral(tok: Token) {
    return tok.type === tokTypes.num ||
           tok.type === tokTypes.string ||
           tok.type === tokTypes._null ||
           tok.type === tokTypes._true ||
           tok.type === tokTypes._false ||
           tok.type === tokTypes.regexp;
}
function tokIsIdent(tok: Token) {
    return tok.type === tokTypes.name;
}

// TODO: this needs to care about macro phase for hygeine
interface ExpansionBindings {
    [name: string]: Token[];
}

let COLOR = 1;

export class Expander {
    private macro: MacroDeclaration;
    private invocation: MacroInvocation;
    private context: Context;
    private idx: number = 0;
    private color: number = COLOR++;

    constructor(invocation: MacroInvocation, context: Context) {
        this.macro = invocation.macro;
        this.invocation = invocation;
        this.context = context;
    }
    expand(): ExpansionResult {
        for (const pattern of this.macro.patterns) {
            const result = this.tryPattern(pattern);

            if (result.success) {
                return result;
            }
        }

        return {
            success: false,
            diagnostic: `no matches found for macro ${this.macro.id.name}`,
        };
    }
    tryPattern(pattern: MacroPattern): ExpansionResult {
        this.resetToken();

        // bindings is a map from
        //   binding name -> token list
        // eventually it should be more complex to handle repeats
        // when bindings are injected into a body, compare the nesting
        // level of the body's repeat with the nesting level of the binding
        // table (once rhs of bindings accounts for the depth of repeats)
        const bindings: ExpansionBindings = {};
        // each match is a single "argument" to the pattern
        for (let i = 0; i < pattern.arguments.length; i++) {
            const arg = pattern.arguments[i];
            const found = arg ? this.tryPatternArgument(arg, bindings) : false;

            if (!found) {
                return { success: false, diagnostic: "FIXME argument doesn't match" };
            }

            this.eatToken(tokTypes.comma);
        }

        if (this.currentToken()) {
            return { success: false, diagnostic: "FIXME incorrect number of arguments" };
        }

        // try to expand body with bindings
        const program = this.tryMacroBody(pattern.body, bindings);
        return { success: true, program };
    }
    tryPatternArgument(args: MacroPatternArgument, bindings: ExpansionBindings): boolean {
        // TODO, only single label matches
        // eventually will need to add another kind
        // for repeats and other groupings
        const tok = this.currentToken();
        if (!tok) return false;

        if (args.type === "MacroPatternVariable") {
            if (args.kind === "literal" && tokIsLiteral(tok)) {
                tok.value = (tok as any).realValue || tok.value;

                this.insertBindings(bindings, {
                    [args.name.name]: [tok],
                });
                this.nextToken();
                return true;
            } else if (args.kind === "ident" && tokIsIdent(tok)) {
                this.insertBindings(bindings, {
                    [args.name.name]: [tok],
                });
                this.nextToken();
                return true;
            } else if (args.kind === "expr") {
                const tokens = this.invocation.tokens.slice(this.idx);
                const argExpr = this.context.parseMacroArgumentExpression(tokens, {});

                this.idx += argExpr.tokens.length;

                this.insertBindings(bindings, {
                    [args.name.name]: argExpr.tokens
                })
                return true;
            }
        } else if (args.type === "MacroPatternLiteral") {
            if (args.token.type === tok.type && args.token.value === tok.value) {
                this.nextToken();
                return true;
            }
        }
        return false;
    }
    tryMacroBody(body: MacroBody, bindings: ExpansionBindings): namedTypes.Program {
        // need to handle repeats at the token level
        const result: Token[] = [];
        const inInvocationScope: Set<Token> = new Set();
        for (const token of body.tokens) {
            if (token.type === tokTypes.name && bindings[token.value]) {
                const binding = bindings[token.value] || [];
                result.push(...binding);
                binding.forEach(b => inInvocationScope.add(b));
            } else {
                result.push(token);
            }
        }
        // dynamically change scope for each token

        const identifierToToken = new WeakMap<namedTypes.Identifier, Token>();
        
        const hooks: ParseHooks = {
            registerIdentifier: (token: Token, id: namedTypes.Identifier) => {
                identifierToToken.set(id, token);
            },
            getScopeStackForIdentifier: (id: namedTypes.Identifier): Scope[] => {
                const token = identifierToToken.get(id);
                if (!token) {
                    throw new Error("could not trace identifier to original token context");
                }

                if (inInvocationScope.has(token)) {
                    return this.invocation.scopeStack;
                } else {
                    return this.macro.scopeStack;
                }
            },
            getColorForIdentifier: (id: namedTypes.Identifier): string | null => {
                const token = identifierToToken.get(id);
                if (!token) {
                    throw new Error("could not trace identifier to original token context");
                }

                if (inInvocationScope.has(token)) {
                    return null;
                } else {
                    return String(this.color);
                }
            }
        }
        return this.context.parseProgram(result, hooks);
    }
    resetToken(idx: number = 0) {
        this.idx = idx;
    }
    nextToken() {
        this.idx++;
    }
    currentToken(): Token | undefined {
        return this.invocation.tokens[this.idx];
    }
    expectToken(type: TokenType) {
        if (this.matchToken(type)) {
            this.nextToken();
        } else {
            throw new Error(`unexpected token, expected ${type.label} but got ${
                this.currentToken()?.type.label} FIXME`);
        }
    }
    eatToken(type: TokenType) {
        if (this.matchToken(type)) {
            this.nextToken();
            return true;
        }
        return false;
    }
    matchToken(type: TokenType) {
        const tok = this.currentToken();
        return tok && tok.type === type;
    }
    insertBindings(bindings: ExpansionBindings, toInsert: ExpansionBindings) {
        for (const [name, value] of Object.entries(toInsert)) {
            if (bindings[name]) {
                throw new Error(`duplicate binding in expander FIXME: ${name}`);
            }
            bindings[name] = value;
        }
    }
}

import { Token, TokenType, tokTypes } from "acorn";

export function consumeTokenTree(end: TokenType, get: () => Token | null): Token[] | null {
    const tokens: Token[] = [];

    let token = get();
    const stack = [end];
    while (stack.length > 0 && token?.type != tokTypes.eof) {
        const top = stack[stack.length - 1];

        if (!token) {
            return null;
        } else if (token.type === top) {
            stack.pop();
        } else if (token.type === tokTypes.braceL) {
            stack.push(tokTypes.braceR);
        } else if (token.type === tokTypes.parenL) {
            stack.push(tokTypes.parenR);
        } else if (token.type === tokTypes.bracketL) {
            stack.push(tokTypes.bracketR);
        } else if (
            token.type === tokTypes.braceR ||
            token.type === tokTypes.parenR ||
            token.type === tokTypes.bracketR
        ) {
            return null;
        }

        if (stack.length > 0) {
            tokens.push(token);
            token = get();
        }
    }

    if (stack.length > 0) {
        return null;
    }
    return tokens;
}

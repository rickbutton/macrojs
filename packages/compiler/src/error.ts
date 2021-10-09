/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { Position, Token } from "acorn";
import type { namedTypes } from "ast-types";
import type { MacroInvocation } from "./types";

export class InternalCompilerError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class ExpansionError extends Error {
    private constructor(name: string, pos: Position, message: string) {
        super(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `in ${name}: ${message} (${pos.line}:${pos.column})`
        );
    }

    static fromInvocation(invocation: MacroInvocation, message: string): ExpansionError {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new ExpansionError(invocation.macro.id.name, invocation.loc?.start as any, message);
    }
    static fromToken(token: Token | undefined, invocation: MacroInvocation, message: string): ExpansionError {
        return new ExpansionError(
            invocation.macro.id.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (token?.loc?.start as any) || (invocation.loc?.start as any),
            message
        );
    }
    static fromIdentifier(name: namedTypes.Identifier, invocation: MacroInvocation, message: string): ExpansionError {
        return new ExpansionError(
            invocation.macro.id.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name.loc?.start || (invocation.loc?.start as any),
            message
        );
    }
}

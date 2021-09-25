// from https://github.com/acornjs/acorn/blob/9cff83e2d1b22c251e57f2117297029466584b92/acorn/src/scopeflags.js
// Used in checkLVal* and declareName to determine the type of a binding
export const
    BIND_NONE = 0, // Not a binding
    BIND_VAR = 1, // Var-style binding
    BIND_LEXICAL = 2, // Let- or const-style binding
    BIND_FUNCTION = 3, // Function declaration
    BIND_SIMPLE_CATCH = 4, // Simple (identifier pattern) catch binding
    BIND_OUTSIDE = 5 // Special case for function names as bound inside the function

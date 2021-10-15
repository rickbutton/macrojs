/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
    transform: {
        "^.+\\.tsx?$": "esbuild-jest",
    },
    verbose: true,
    testTimeout: 30000,
    testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
};

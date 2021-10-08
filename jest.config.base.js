/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    preset: "ts-jest",
    verbose: true,
    testTimeout: 30000,
    testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
};

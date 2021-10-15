#!/usr/bin/env node
import path from "path";
import fs from "fs";
import url from "url";
import esbuild from "esbuild";
import chalk from "chalk";
import { nodeExternalsPlugin } from "esbuild-node-externals";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function hasArg(arg) {
    return args.includes(arg);
}

function writePackageJson(filePath, type) {
    const content = { type };
    fs.writeFileSync(filePath, JSON.stringify(content, null, 4));
}

function makePlugin(name, color, type) {
    let start;
    const prefix = color(`[@macrojs/${name}]:`);
    return {
        name: "logger",
        setup(build) {
            build.onStart(() => {
                start = Date.now();
                console.log(`${prefix} build started`);
            });
            build.onEnd(() => {
                const time = Date.now() - start;
                console.log(`${prefix} build finished in ${time}ms`);

                if (type === "esm" || type === "cjs") {
                    const packageType = type === "esm" ? "module" : "commonjs";

                    writePackageJson(path.join("packages", name, "dist", type, "package.json"), packageType);
                } else {
                    throw new Error("unknown type");
                }
            });
        },
    };
}

async function buildPkg(name, color, watch) {
    /** @type {import('esbuild').BuildOptions} */
    const packageDir = path.join(__dirname, "packages", name);
    const packageJson = path.join(packageDir, "package.json");

    const config = {
        absWorkingDir: path.join(__dirname, "packages", name),
        entryPoints: ["src/index.ts"],
        tsconfig: "tsconfig.json",
        sourcemap: true,
        bundle: true,
        external: ["os", "assert", "fs", "@macrojs/*"],
        incremental: watch,
        watch,
    };

    /** @type {import('esbuild').BuildOptions} */
    const cjs = {
        ...config,
        outdir: "dist/cjs/",
        format: "cjs",
        plugins: [makePlugin(name, color, "cjs"), nodeExternalsPlugin({ packagePath: packageJson })],
    };

    /** @type {import('esbuild').BuildOptions} */
    const esm = {
        ...config,
        outdir: "dist/esm/",
        format: "esm",
        plugins: [makePlugin(name, color, "esm"), nodeExternalsPlugin({ packagePath: packageJson })],
    };

    await Promise.all([cjs, esm].map((t) => esbuild.build(t).catch(() => process.exit(1))));
}

const watch = hasArg("-w");

buildPkg("compiler", chalk.red, watch);
buildPkg("cli", chalk.yellow, watch);

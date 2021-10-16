#!/usr/bin/env node
import path from "path";
import fs from "fs";
import url from "url";
import esbuild from "esbuild";
import { nodeExternalsPlugin as externals } from "esbuild-node-externals";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function hasArg(arg) {
    return args.includes(arg);
}

function writePackageJson(filePath, type) {
    const content = { type };
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(content, null, 4));
}

function makePlugin() {
    return {
        name: "resolver",
        setup(build) {
            build.onResolve({ filter: /^os$/ }, () => {
                return { path: path.join(__dirname, "node_modules", "os-browserify/browser.js") };
            });
            build.onLoad({ filter: /^fs$/ }, () => {
                return {
                    contents: JSON.stringify({}),
                    loader: "json",
                };
            });
        },
    };
}

const watch = hasArg("-w");
const overrides = {
    watch,
    incremental: watch,
};

function baseTarget(name) {
    const packageDir = path.join(__dirname, "packages", name);
    const packageJson = path.join(packageDir, "package.json");

    /** @type import('esbuild').BuildOptions */
    return {
        logLevel: "info",
        absWorkingDir: path.join(__dirname, "packages", name),
        entryPoints: ["src/index.ts"],
        tsconfig: "tsconfig.json",
        sourcemap: true,
        bundle: true,
        external: ["fs", "assert", "@macrojs/*"],
        plugins: [externals({ packagePath: packageJson })],
    };
}

function regularTargets(name, overrides) {
    const base = baseTarget(name);

    writePackageJson(path.join("packages", name, "dist", "cjs", "package.json"), "commonjs");
    writePackageJson(path.join("packages", name, "dist", "esm", "package.json"), "module");

    const makeBrowser = !!overrides.makeBrowser;
    delete overrides.makeBrowser;

    const cjs = {
        ...base,
        outdir: "dist/cjs/",
        format: "cjs",
        plugins: [...base.plugins],
        ...overrides,
    };
    const esm = {
        ...base,
        outdir: "dist/esm/",
        format: "esm",
        plugins: [...base.plugins],
        ...overrides,
    };

    if (makeBrowser) {
        const bundle = {
            ...base,
            outdir: "dist/browser/",
            format: "esm",
            plugins: [makePlugin()],
            external: [],
            ...overrides,
        };
        return [cjs, esm, bundle];
    } else {
        return [cjs, esm];
    }
}

function webTargets(name, overrides) {
    const base = baseTarget(name);

    const web = {
        ...base,
        mainFields: ["browser"],
        outdir: "dist/",
        plugins: [makePlugin()],
        loader: {
            ".ttf": "file",
            ".html": "file",
        },
        external: [],
        inject: ["src/process-shim.js"],
        ...overrides,
    };

    function makeWebFile(entry, over) {
        return {
            ...web,
            entryPoints: [entry],
            ...over,
        };
    }

    return [
        makeWebFile("src/index.ts"),
        makeWebFile("src/index.html", { assetNames: "[dir]/[name]" }),
        makeWebFile("src/style.css"),
        // if editor support will be needed
        //makeWebFile("node_modules/monaco-editor/esm/vs/editor/editor.worker.js"),
        //makeWebFile("node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js"),
    ];
}

async function execute(targets) {
    return Promise.all(targets.map((target) => esbuild.build(target).catch(() => process.exit(1))));
}

async function start() {
    const targets = [
        ...regularTargets("compiler", { ...overrides, makeBrowser: true }),
        ...regularTargets("cli", overrides),
    ];

    await execute(targets);

    if (hasArg("-r")) {
        await execute(webTargets("repl", overrides));
    }
}

start();

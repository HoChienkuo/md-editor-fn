import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptFile);
const rootDirectory = path.resolve(scriptDirectory, '..');

const buildDirectory = path.join(rootDirectory, 'build');
const packageDirectory = path.join(buildDirectory, 'package');

const frontendDirectory = path.join(rootDirectory, 'frontend');
const backendDirectory = path.join(rootDirectory, 'backend');

const frontendDistDirectory = path.join(frontendDirectory, 'dist');
const backendDistDirectory = path.join(backendDirectory, 'dist');

const isWindows = process.platform === 'win32';

const npmCommand = 'npm';
const fnpackCommand = 'fnpack';

function log(message) {
    process.stdout.write(`[build] ${message}\n`);
}

function fail(message) {
    throw new Error(message);
}

function run(command, args, options = {}) {
    log(`${command} ${args.join(' ')}`);

    const result = spawnSync(command, args, {
        cwd: rootDirectory,
        stdio: 'inherit',

        /*
         * Windows 的 npm 和 fnpack 可能是 .cmd 启动脚本，
         * 必须通过 cmd.exe 执行。
         */
        shell: isWindows,

        ...options
    });

    if (result.error) {
        const reason = result.error.message || String(result.error);

        fail(
            `无法启动命令：${command}\n` +
            `原因：${reason}`
        );
    }

    if (result.signal) {
        fail(
            `命令被信号终止：${command}\n` +
            `信号：${result.signal}`
        );
    }

    if (result.status !== 0) {
        fail(
            `命令执行失败：${command} ${args.join(' ')}\n` +
            `退出码：${String(result.status)}`
        );
    }
}

function ensureFile(filePath) {
    if (!existsSync(filePath)) {
        fail(`缺少必要文件：${filePath}`);
    }
}

function ensureDirectory(directoryPath) {
    mkdirSync(directoryPath, {
        recursive: true
    });
}

function removeDirectory(directoryPath) {
    if (!existsSync(directoryPath)) {
        return;
    }

    rmSync(directoryPath, {
        recursive: true,
        force: true
    });
}

function copyFileOrDirectory(sourcePath, targetPath) {
    ensureFile(sourcePath);

    cpSync(sourcePath, targetPath, {
        recursive: true,
        force: true,

        filter(currentSourcePath) {
            const fileName = path.basename(currentSourcePath);

            return fileName !== '.DS_Store';
        }
    });
}

function validateJsonFile(filePath) {
    ensureFile(filePath);

    const source = readFileSync(filePath, 'utf8');

    try {
        JSON.parse(source);
    } catch (error) {
        const reason = error instanceof Error
            ? error.message
            : String(error);

        fail(`JSON 格式错误：${filePath}\n${reason}`);
    }
}

function validateSourceFiles() {
    log('检查应用基础文件');

    ensureFile(path.join(rootDirectory, 'manifest'));
    ensureFile(path.join(rootDirectory, 'ICON.PNG'));
    ensureFile(path.join(rootDirectory, 'ICON_256.PNG'));
    ensureFile(path.join(rootDirectory, 'cmd', 'main'));

    validateJsonFile(
        path.join(rootDirectory, 'config', 'resource')
    );

    validateJsonFile(
        path.join(rootDirectory, 'config', 'privilege')
    );

    validateJsonFile(
        path.join(rootDirectory, 'package.json')
    );

    validateJsonFile(
        path.join(frontendDirectory, 'package.json')
    );

    validateJsonFile(
        path.join(backendDirectory, 'package.json')
    );
}

function clean() {
    log('清理构建目录');

    removeDirectory(buildDirectory);
    removeDirectory(frontendDistDirectory);
    removeDirectory(backendDistDirectory);
}

function buildWorkspaces() {
    log('执行 TypeScript 检查');

    run(npmCommand, [
        'run',
        'typecheck'
    ]);

    log('构建前端');

    run(npmCommand, [
        'run',
        'build:frontend'
    ]);

    log('构建后端');

    run(npmCommand, [
        'run',
        'build:backend'
    ]);
}

function createRuntimePackageJson() {
    const backendPackagePath = path.join(
        backendDirectory,
        'package.json'
    );

    const backendPackage = JSON.parse(
        readFileSync(backendPackagePath, 'utf8')
    );

    const runtimePackage = {
        name: 'md-editor-fn-runtime',
        version: backendPackage.version,
        private: true,
        type: 'module',
        main: 'server/index.js',
        engines: {
            node: '>=22 <23'
        },
        dependencies: backendPackage.dependencies ?? {}
    };

    writeFileSync(
        path.join(packageDirectory, 'package.json'),
        `${JSON.stringify(runtimePackage, null, 2)}\n`,
        'utf8'
    );
}

function assembleApplication() {
    log('整理 FPK 应用目录');

    removeDirectory(packageDirectory);
    ensureDirectory(packageDirectory);

    ensureDirectory(
        path.join(packageDirectory, 'bin')
    );

    copyFileOrDirectory(
        path.join(rootDirectory, 'manifest'),
        path.join(packageDirectory, 'manifest')
    );

    copyFileOrDirectory(
        path.join(rootDirectory, 'ICON.PNG'),
        path.join(packageDirectory, 'ICON.PNG')
    );

    copyFileOrDirectory(
        path.join(rootDirectory, 'ICON_256.PNG'),
        path.join(packageDirectory, 'ICON_256.PNG')
    );

    copyFileOrDirectory(
        path.join(rootDirectory, 'cmd'),
        path.join(packageDirectory, 'cmd')
    );

    copyFileOrDirectory(
        path.join(rootDirectory, 'config'),
        path.join(packageDirectory, 'config')
    );

    copyFileOrDirectory(
        backendDistDirectory,
        path.join(packageDirectory, 'server')
    );

    copyFileOrDirectory(
        frontendDistDirectory,
        path.join(packageDirectory, 'public')
    );

    createRuntimePackageJson();

    log(`应用目录已生成：${packageDirectory}`);
}

function installProductionDependencies() {
    const runtimePackagePath = path.join(
        packageDirectory,
        'package.json'
    );

    const runtimePackage = JSON.parse(
        readFileSync(runtimePackagePath, 'utf8')
    );

    const dependencyCount = Object.keys(
        runtimePackage.dependencies ?? {}
    ).length;

    if (dependencyCount === 0) {
        log('后端暂无生产依赖，跳过 npm install');
        return;
    }

    log('安装后端生产依赖');

    run(
        npmCommand,
        [
            'install',
            '--omit=dev',
            '--ignore-scripts'
        ],
        {
            cwd: packageDirectory
        }
    );
}

function buildApplication() {
    clean();
    validateSourceFiles();
    buildWorkspaces();
    assembleApplication();
    installProductionDependencies();
}

function buildFpk() {
    buildApplication();

    log('调用 fnpack 构建 FPK');

    run(
        fnpackCommand,
        [
            'build',
            '--directory',
            packageDirectory
        ],
        {
            cwd: buildDirectory
        }
    );

    log('FPK 构建完成');
}

function printUsage() {
    process.stdout.write(`
用法：

  node scripts/build.mjs clean
  node scripts/build.mjs app
  node scripts/build.mjs fpk
`);
}

const command = process.argv[2];

switch (command) {
    case 'clean':
        clean();
        break;

    case 'app':
        buildApplication();
        break;

    case 'fpk':
        buildFpk();
        break;

    default:
        printUsage();
        process.exitCode = 1;
}
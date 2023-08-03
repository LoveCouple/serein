#!/usr/bin/env node
const context = {
	cli_version: '1.3.2',
	pnpm: false,
	defaultCode:
		'/*\n _____________________ \n< do things u want... >\n--------------------- \n      \\   ^__^\n       \\  (oo)_______\n          (__)\\       )\\/\\\n              ||----w |\n              ||     ||\n*/'
};

const program = require('commander');
const path = require('path');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const del = require('delete');
const PNG = require('pngjs').PNG;
const icon_gen = require('fractal-icon-cjs');
const {
	SERVER,
	SERVER_UI,
	SERVER_ADMIN,
	SERVER_GAMETEST,
	SERVER_NET
} = require('./src/constants.js');
const {
	magenta,
	warning,
	accept,
	done,
	req,
	mkdir,
	writeJSON,
	writeText,
	exec,
	askProjectInfo,
	askBase,
	askRequire,
	askVersion,
	askYes,
	getLatestServerVersion,
	checkPnpm,
	npmInstall
} = require('./src/utils.js');

program
	.name('serein')
	.description('A Minecraft: Bedrock Edition creation manage tool.')
	.version(context.cli_version);

program
	.command('init')
	.alias('i')
	.description('init a project')
	.option('-y --yes', 'use default config without asking any questions')
	.action((option) =>
		checkIfPnpmExist(option.yes)
			.then(getInformation)
			.then(downloadFiles)
			.then(dealDependencies)
			.then(creatFiles)
	);

program
	.command('switch')
	.alias('s')
	.description('switch requirements version')
	.option('-y --yes', 'switch to latest version directly')
	.action((option) =>
		checkIfPnpmExist(option.yes)
			.then(getVersionInformations)
			.then(chooseVersions)
			.then(switchVersions)
	);

program
	.command('build')
	.alias('b')
	.description('build scripts for production environment')
	.action(() => exec('gulp build'));

program
	.command('deploy')
	.alias('d')
	.description('deploy project to game')
	.action(() => exec('gulp'));

program
	.command('pack')
	.alias('p')
	.description('build the .mcpack for the current project')
	.action(() => exec('gulp bundle'));

program
	.command('watch')
	.alias('w')
	.description('listen for file changes and deploy project automatically')
	.action(() => exec('gulp watch'));

program.parse(process.argv);

async function checkIfPnpmExist(isDefault) {
	context.pnpm = checkPnpm();
	return isDefault;
}

async function getInformation(isDefault) {
	if (!isDefault) {
		console.log('This utility will walk you through creating a project.');
		console.log('Press ^C at any time to quit.');

		const { name, version, description } = await askProjectInfo();

		const versionArray = version.split('.').map((x) => parseInt(x));

		console.log(
			'Now I will inquire you the dependencies of your project, including the version. Please follow the guide to choose a specific version to download.'
		);
		console.log(
			warning(
				'You should make sure the dependencies are well organized if you want to use dependencies (latest version) besides @mc/server.'
			)
		);
		const server = {
			need: true,
			version: await askVersion(SERVER)
		};
		const server_ui = await askRequire(SERVER_UI);
		const server_admin = await askRequire(SERVER_ADMIN);
		const server_gametest = await askRequire(SERVER_GAMETEST);
		const server_net = await askRequire(SERVER_NET);
		const res = await askYes(`Create ${magenta('resource_packs')}?`, true);
		const allow_eval = await askYes(
			`Allow ${magenta('eval')} and ${magenta('new Function')}?`
		);
		const language = await askBase('Language:', ['ts', 'js']);

		return {
			name: name,
			version: version,
			versionArray: versionArray,
			description: description,
			res: res,
			allow_eval: allow_eval,
			language: language,
			packageVersions: {
				[SERVER]: server,
				[SERVER_UI]: server_ui,
				[SERVER_GAMETEST]: server_gametest,
				[SERVER_NET]: server_net,
				[SERVER_ADMIN]: server_admin
			}
		};
	} else {
		const reject = { need: false };

		return {
			name: path.basename(process.cwd()),
			version: '1.0.0',
			versionArray: [1, 0, 0],
			description: '',
			res: true,
			allow_eval: false,
			language: 'ts',
			packageVersions: {
				[SERVER]: {
					need: true,
					version: await getLatestServerVersion()
				},
				[SERVER_UI]: reject,
				[SERVER_GAMETEST]: reject,
				[SERVER_NET]: reject,
				[SERVER_ADMIN]: reject
			}
		};
	}
}

async function downloadFiles(informations) {
	process.stdout.write('Downloading the gulpfile...  ');
	const gulpfile = await req('https://serein.meowshe.com/gulpfile.js');
	console.log(done);

	process.stdout.write('Generating project icon... ');
	const icon = PNG.sync.write(icon_gen.gen_icon(informations.name));
	console.log(done);

	return {
		...informations,
		gulpfile: gulpfile,
		icon: icon
	};
}

async function dealDependencies(informations) {
	informations.npmVersions = [];
	informations.versions = [];
	for (const x in informations.packageVersions) {
		const current = informations.packageVersions[x];
		if (current.need === false) continue;
		informations.npmVersions[x] = current.version.npm;
		informations.versions[x] = current.version.api;
	}

	const resuuid = uuid(),
		dependencies = [],
		npmVersionsFiltered = {};

	if (informations.res)
		dependencies.push({
			uuid: resuuid,
			version: informations.versionArray
		});

	for (const name in informations.packageVersions) {
		const current = informations.packageVersions[name];
		if (current.need) {
			dependencies.push({
				module_name: name,
				version: informations.versions[name]
			});
			npmVersionsFiltered[name] = informations.npmVersions[name];
		}
	}

	return {
		...informations,
		npmVersionsFiltered: npmVersionsFiltered,
		dependencies: dependencies,
		resuuid: resuuid
	};
}

async function creatFiles(informations) {
	console.log('Creating project... ');
	await mkdir(['behavior_packs', 'behavior_packs/scripts', 'scripts']);
	if (informations.res) await mkdir(['resource_packs']);

	writeText('behavior_packs/pack_icon.png', informations.icon);

	writeJSON('.serein.json', {
		type: informations.language,
		res: informations.res,
		name: informations.name,
		mc_preview: false,
		output: 'build',
		mc_dir: null
	});

	writeJSON('behavior_packs/manifest.json', {
		format_version: 2,
		header: {
			name: informations.name,
			description: informations.description,
			uuid: uuid(),
			version: informations.versionArray,
			min_engine_version: [1, 19, 20]
		},
		modules: [
			{
				description: 'Script resources',
				language: 'javascript',
				type: 'script',
				uuid: uuid(),
				version: [2, 0, 0],
				entry: 'scripts/main.js'
			}
		],
		dependencies: informations.dependencies,
		capabilities: informations.allow_eval ? ['script_eval'] : []
	});

	if (informations.res) {
		writeText('resource_packs/pack_icon.png', informations.icon);

		writeJSON('resource_packs/manifest.json', {
			format_version: 2,
			header: {
				description: informations.description,
				name: informations.name,
				uuid: informations.resuuid,
				version: informations.versionArray,
				min_engine_version: [1, 19, 20]
			},
			modules: [
				{
					description: informations.description,
					type: 'resources',
					uuid: uuid(),
					version: informations.versionArray
				}
			]
		});
	}

	const npmPackage = {
		name: informations.name,
		version: informations.version,
		type: 'module',
		description: informations.description,
		dependencies: {
			...informations.npmVersionsFiltered,
			del: '7.0.0',
			gulp: '^4.0.2',
			'gulp-esbuild': '^0.11.0',
			'gulp-typescript': '^6.0.0-alpha.1',
			'gulp-zip': '^5.1.0'
		}
	};

	if (informations.language === 'ts') {
		writeJSON('tsconfig.json', {
			compilerOptions: {
				target: 'es2020',
				module: 'es2020',
				noLib: false,
				emitDecoratorMetadata: true,
				experimentalDecorators: true,
				pretty: true,
				allowUnreachableCode: true,
				allowUnusedLabels: true,
				noImplicitAny: true,
				rootDir: '.',
				listFiles: false,
				noEmitHelpers: true
			},
			include: ['scripts/**/*'],
			compileOnSave: false
		});

		writeText('scripts/main.ts', context.defaultCode);
	} else {
		writeText('scripts/main.js', context.defaultCode);
	}

	writeJSON('package.json', npmPackage);

	writeText(
		'.mcattributes',
		'diagnostic.disable.minecraft.manifest.module.missing=true'
	);

	writeText('gulpfile.js', informations.gulpfile);

	npmInstall(context.pnpm);
}

async function getVersionInformations(isDefault) {
	const manifest = JSON.parse(
		fs.readFileSync('./behavior_packs/manifest.json', 'utf-8')
	);
	const packages = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

	return {
		isDefault: isDefault,
		manifest: manifest,
		packages: packages
	};
}

async function chooseVersions(informations) {
	for (const x in informations.manifest.dependencies) {
		const current = informations.manifest.dependencies[x].module_name || '';
		if (current.search(/@minecraft/) !== -1) {
			const switchYes =
				informations.isDefault ||
				(await askYes(
					`Do you want to switch versions dependent on ${magenta(
						current
					)}?`
				));

			if (switchYes) {
				const version = !informations.isDefault
					? await askVersion(current)
					: await getLatestServerVersion();
				informations.manifest.dependencies[x].version = version.api;
				informations.packages.dependencies[current] = version.npm;
				console.log(
					`Dependency ${magenta(current)} update to ${accept(
						informations.manifest.dependencies[x].version
					)}`
				);
			}
		}
	}

	return informations;
}

function switchVersions(informations) {
	writeJSON('./behavior_packs/manifest.json', informations.manifest);

	writeJSON('package.json', informations.packages);

	del.sync('node_modules');
	if (context.pnpm && fs.existsSync('pnpm-lock.yaml'))
		del.sync('pnpm-lock.yaml');
	del.sync('package-lock.json');

	npmInstall(context.pnpm);
}

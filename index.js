#!/usr/bin/env node
const cli_version = '1.2.1';

const readlineSync = require('readline-sync');
const program = require('commander');
const path = require('path');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const del = require('delete');
const PNG = require('pngjs').PNG;
const icon_gen = require('fractal-icon-cjs');
const {
	error,
	gary,
	magenta,
	warning,
	accept,
	done,
	getJSON,
	req,
	mkdir,
	writeJSON,
	writeText,
	exec,
	askBase,
	askRequire,
	askVersion,
	askYes
} = require('./utils.js');


program
	.name('serein')
	.description('A Minecraft: Bedrock Edition creation manage tool.')
	.version(cli_version);

program
	.command('init')
	.alias('i')
	.description('init a project')
	.option('-y --yes', 'use default config without asking any questions')
	.action((option) =>
		getInformation(option.yes)
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
		getVersionInformations(option.yes)
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

function getInformation(isDefault) {
	return new Promise((resolve) => {
		if (!isDefault) {
			console.log(
				'This utility will walk you through creating a project.'
			);
			console.log('Press ^C at any time to quit.');

			const name =
				readlineSync.question(
					`project name: (${warning(path.basename(process.cwd()))}) `
				) || path.basename(process.cwd());
			const version =
				readlineSync.question(`version: ${warning('(1.0.0)')} `) ||
				'1.0.0';
			const versionArray = version.split('.').map((x) => parseInt(x));
			const description = readlineSync.question('description: ') || '';

			console.log(
				`Now I will aquire you the dependencies of your project, including the version. Please follow the guide to choose a specific game version or we will download the ${magenta(
					'latest'
				)} version.`
			);
			console.log(
				warning(
					'You should make sure the dependencies are well organized if you want to use dependencies (latest version) besides @mc/server.'
				)
			);

			const toRequire = ([x, y]) => {
				return {
					need: x,
					version: y
				};
			};
			const server = toRequire([true, askVersion('@minecraft/server')]);
			const server_ui = toRequire(askRequire('@minecraft/server-ui'));
			const server_admin = toRequire(
				askRequire('@minecraft/server-admin')
			);
			const server_gametest = toRequire(
				askRequire('@minecraft/server-gametest')
			);
			const server_net = toRequire(askRequire('@minecraft/server-net'));
			const res =
				askYes(`Create ${magenta('resource_packs')}?`, false) === 'no';
			const allow_eval =
				askYes(
					`Allow ${magenta('eval')} and ${magenta('new Function')}?`
				) === 'yes';
			const languageStr = askBase('Language:', 'ts', ['js', 'ts']);
			const language =
				languageStr === 'js' || languageStr === 'j' ? 'js' : 'ts';

			resolve({
				name: name,
				version: version,
				versionArray: versionArray,
				description: description,
				res: res,
				allow_eval: allow_eval,
				language: language,
				packageVersions: {
					'@minecraft/server': server,
					'@minecraft/server-ui': server_ui,
					'@minecraft/server-gametest': server_gametest,
					'@minecraft/server-net': server_net,
					'@minecraft/server-admin': server_admin
				}
			});
		} else {
			const reject = { need: false };

			resolve({
				name: path.basename(process.cwd()),
				version: '1.0.0',
				versionArray: [1, 0, 0],
				description: '',
				res: true,
				allow_eval: false,
				language: 'ts',
				packageVersions: {
					'@minecraft/server': {
						need: true,
						version: { mode: 'latest' }
					},
					'@minecraft/server-ui': reject,
					'@minecraft/server-gametest': reject,
					'@minecraft/server-net': reject,
					'@minecraft/server-admin': reject
				}
			});
		}
	});
}

async function downloadVersions() {
	process.stdout.write('Getting the lastest dependencies version...  ');
	const versions = await getJSON(
		'https://serein.shannon.science/version.json'
	);
	const npmVersion = await getJSON(
		'https://serein.shannon.science/npm_version.json'
	);
	console.log(done);

	return [versions, npmVersion];
}

async function downloadFiles(informations) {
	const [versions, npmVersions] = await downloadVersions();

	process.stdout.write('Downloading the gulpfile...  ');
	const gulpfile = await req('https://serein.shannon.science/gulpfile.js');
	console.log(done);

	process.stdout.write('Generating project icon... ');
	const icon = PNG.sync.write(icon_gen.gen_icon(informations.name));
	console.log(done);

	return {
		...informations,
		versions: versions,
		npmVersions: npmVersions,
		gulpfile: gulpfile,
		icon: icon
	};
}

function dealDependencies(informations) {
	for (const x in informations.packageVersions) {
		const current = informations.packageVersions[x];
		if (current.need === false) continue;
		else if (current.version.mode === 'manual') {
			informations.npmVersions[x] = current.version.npmVersion;
			informations.versions[x] = current.version.manifestVersion;
		}
	}

	const toDependencies = (name) => {
		return {
			module_name: name,
			version: informations.versions[name]
		};
	};

	const resuuid = uuid(),
		dependencies = [],
		npmVersionsFiltered = {};

	if (informations.res)
		dependencies.push({
			uuid: resuuid,
			version: informations.versionArray
		});

	for (const x in informations.packageVersions) {
		const current = informations.packageVersions[x];
		if (current.need) {
			dependencies.push(toDependencies(x));
			npmVersionsFiltered[x] = informations.npmVersions[x];
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
		bds: false,
		bds_path: '~/bds/',
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
			'gulp-cli': '^2.3.0',
			'gulp-esbuild': '^0.11.0',
			'gulp-typescript': '^6.0.0-alpha.1',
			'gulp-zip': '^5.1.0'
		}
	};

	const defaultCode =
		'/*\n _____________________ \n< do things u want... >\n--------------------- \n      \\   ^__^\n       \\  (oo)_______\n          (__)\\       )\\/\\\n              ||----w |\n              ||     ||\n*/';

	if (informations.language === 'ts') {
		writeJSON('tsconfig.json', {
			compilerOptions: {
				target: 'es2020',
				moduleResolution: 'node',
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

		writeText('scripts/main.ts', defaultCode);
	} else {
		writeText('scripts/main.js', defaultCode);
	}

	writeJSON('package.json', npmPackage);

	writeText(
		'.mcattributes',
		'diagnostic.disable.minecraft.manifest.module.missing=true'
	);

	writeText('gulpfile.js', informations.gulpfile);

	exec('npm install');
}

async function getVersionInformations(isDefault) {
	const manifest = JSON.parse(
		fs.readFileSync('./behavior_packs/manifest.json', 'utf-8')
	);
	const packages = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
	const [versions, npmVersions] = await downloadVersions();

	return {
		isDefault: isDefault,
		manifest: manifest,
		packages: packages,
		versions: versions,
		npmVersions: npmVersions
	};
}

function chooseVersions(informations) {
	for (const x in informations.manifest['dependencies']) {
		const current =
			informations.manifest['dependencies'][x]['module_name'] || '';
		if (current.search(/@minecraft/) !== -1) {
			const switchYes =
				askYes(
					`Do you want to switch versions dependent on ${magenta(
						current
					)}?`
				) === 'yes';

			if (switchYes) {
				let version = { mode: 'latest' };
				if (!informations.isDefault) version = askVersion(current);
				if (version.mode === 'latest') {
					informations.manifest['dependencies'][x]['version'] =
						informations.versions[current];
					informations.packages['dependencies'][current] =
						informations.npmVersions[current];
				} else {
					informations.manifest['dependencies'][x]['version'] =
						version.manifestVersion;
					informations.packages['dependencies'][current] =
						version.npmVersion;
				}

				console.log(
					`Dependency ${magenta(current)} update to ${accept(
						informations.manifest['dependencies'][x]['version']
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
	del.sync('package-lock.json');

	exec('npm install');
}

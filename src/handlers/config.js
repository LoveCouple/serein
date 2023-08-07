import { Hanlder } from './base.js';
import { writeJSON } from '../base/io.js';
import { existsSync, readFileSync } from 'fs';

class ConfigClass extends Hanlder {
	constructor() {
		super();
		this.context = {};
	}

	update() {
		if (existsSync('.serein.json')) {
			this.context = JSON.parse(readFileSync('', 'utf-8'));
			this.updated = true;
		}
	}

	writeConfig(context) {
		this.context = context;
		this.updated = true;
		writeJSON('.serein.json', context);
	}

	getConfig() {
		this.check();
		return this.context;
	}
}

const ConfigRender = new ConfigClass();

export default ConfigRender;

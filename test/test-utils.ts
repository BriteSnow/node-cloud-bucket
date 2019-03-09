import * as jsyaml from 'js-yaml';
import * as fs from 'fs-extra-plus';

export async function yaml(content: string) {
	const yamlObj = jsyaml.load(content);
	if (!yamlObj) {
		throw new Error(`Could not load yaml from `);
	}
	return yamlObj;
}

export async function loadYaml(path: string) {
	const yamlContent = await fs.readFile(path, 'utf8');
	return yaml(yamlContent);
}
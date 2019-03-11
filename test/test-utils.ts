import * as jsyaml from 'js-yaml';
import * as fs from 'fs-extra-plus';
import { saferRemove, mkdirp } from 'fs-extra-plus';
import { getBucket } from '../src';

export const testDir = './test-data/';
export const testTmpDir = './test-data/~tmp/';

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

export async function cleanTmpDir() {
	//// clean local folder
	await saferRemove(testTmpDir);
	await mkdirp(testTmpDir);
}

export async function cleanAll(rawCfg: any) {
	console.log('---- cleanAll');
	await cleanTmpDir();
	//// clean remove bucket
	const bucket = await getBucket(rawCfg);

	const files = await bucket.list();

	for (const f of files) {
		await bucket.delete(f.path);
	}
	console.log('---- cleanAll --- DONE');

	return bucket;
}

export async function loadBucketCfg(name: string) {
	let vdevBuckets: any = await loadYaml('./test-data/~test-buckets.yaml');
	return vdevBuckets.buckets[name];
}
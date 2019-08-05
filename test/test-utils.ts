import * as jsyaml from 'js-yaml';
import * as fs from 'fs-extra-plus';
import { saferRemove, mkdirp } from 'fs-extra-plus';
import { getBucket } from '../src';

export const testDir = './test-data/dir/';
export const testTmpDir = './test-data/~tmp/';
export const testFileName = 'test-file-01.txt';
export const testLocalFilePath = testDir + testFileName;

//#region    ---------- Data Loaders ---------- 
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
//#endregion ---------- /Data Loaders ---------- 

//#region    ---------- Data Cleaners ---------- 
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
//#endregion ---------- /Data Cleaners ---------- 


//#region    ---------- Suite Generators ---------- 
type TestFn = (rawCfg: any) => Promise<void>;
export function generateTests(tests: { [name: string]: TestFn }) {

	for (const name of Object.keys(tests)) {
		it(`${name}-gcp`, async function () {
			this.timeout(15000);
			const cfg = await loadBucketCfg('testGcp');
			await tests[name].call(this, cfg);
		});
		it(`${name}-aws`, async function () {
			this.timeout(15000);
			const cfg = await loadBucketCfg('testAws');
			await tests[name].call(this, cfg);
		});
	}
}
//#endregion ---------- /Suite Generators ---------- 


//#region    ---------- Check Helpers ---------- 
export function checkIsoDate(val?: string | null) {
	if (!val) {
		throw new Error(`date null`);
	}
	const iso = /^\d{4}-([0]\d|1[0-2])-([0-2]\d|3[01])T/;
	const match = val.match(iso);
	if (!match) {
		throw new Error(`date ${val} is not iso format`);
	}
}
//#endregion ---------- /Check Helpers ----------

import * as fs from 'fs-extra-plus';
import { mkdirp, saferRemove } from 'fs-extra-plus';
import * as jsyaml from 'js-yaml';
import { getBucket } from '../src';

export const TEST_DIR = './test-data/dir/';
export const TEST_TMP_DIR = './test-data/.tmp/';
export const TEST_FILE_NAME_01 = 'test-file-01.txt';
export const TEST_FILE_LOCALPATH_01 = TEST_DIR + TEST_FILE_NAME_01;

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
	return yaml(yamlContent) as any;
}
//#endregion ---------- /Data Loaders ---------- 

//#region    ---------- Data Cleaners ---------- 
export async function cleanTmpDir() {
	//// clean local folder
	await saferRemove(TEST_TMP_DIR);
	await mkdirp(TEST_TMP_DIR);
}

export async function cleanAll(rawCfg: any) {
	console.log('---- cleanAll');
	await cleanTmpDir();
	//// clean remove bucket
	const bucket = await getBucket(rawCfg);

	const files = await bucket.listFiles();

	for (const f of files) {
		await bucket.delete(f.path);
	}
	console.log('---- cleanAll --- DONE');

	return bucket;
}

export async function loadBucketCfg(name: string) {
	let vdevBuckets: any = await loadYaml('./test-data/.test-buckets.yaml');
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
		it(`${name}-minio`, async function () {
			this.timeout(15000);
			const cfg = await loadBucketCfg('testMinio');
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


export function wait(ms: number) {
	return new Promise((res, rej) => setTimeout(res, ms));
}
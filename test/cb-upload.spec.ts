import { strictEqual } from 'assert';
import { readFile } from 'fs-extra-plus';
import { cleanAll, loadBucketCfg, testTmpDir } from './test-utils';


const testFileName = 'test-file.txt';
const testDir = './test-data/'
const localTestFile = testDir + testFileName;

describe('cb-upload-content-gcp', function () {

	it('cb-download-as-text-gcp', async function () {
		this.timeout(15000);
		const cfg = await loadBucketCfg('testGcp');
		await testUploadContent.call(this, cfg);
	});

	it('cb-download-as-text-aws', async function () {
		this.timeout(15000);
		const cfg = await loadBucketCfg('testAws');
		await testUploadContent.call(this, cfg);
	});

});

//#region    ---------- Test Functions ---------- 


async function testUploadContent(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);
	const txtPath = 'test-content.txt';
	const jsonPath = 'test-content.json';

	const originalContent = '{"some": "content",\n"val": 2}';

	await bucket.uploadContent(txtPath, originalContent);
	let content = await bucket.downloadAsText(txtPath);
	let file = await bucket.getFile(txtPath);
	strictEqual(file!.contentType, 'text/plain; charset=utf-8');
	strictEqual(content, originalContent);

	await bucket.uploadContent(jsonPath, originalContent);
	content = await bucket.downloadAsText(txtPath);
	file = await bucket.getFile(txtPath);
	strictEqual(file!.contentType, 'text/plain; charset=utf-8');
	strictEqual(content, originalContent);
}

//#endregion ---------- /Test Functions ----------


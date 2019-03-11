import { strictEqual } from 'assert';
import { readFile } from 'fs-extra-plus';
import { cleanAll, loadBucketCfg, testTmpDir } from './test-utils';


const testFileName = 'test-file.txt';
const testDir = './test-data/'
const localTestFile = testDir + testFileName;

describe('cb-download', function () {

	it('cb-download-as-text-gcp', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testGcp');
		await testDownloadAsText.call(this, cfg);
	});

	it('cb-download-as-text-aws', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testAws');
		await testDownloadAsText.call(this, cfg);
	});

	it('cb-download-rename-aws', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testAws');
		await testDownloadRename.call(this, cfg);
	});

	it('cb-download-rename-gcp', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testGcp');
		await testDownloadRename.call(this, cfg);
	});
});

//#region    ---------- Test Functions ---------- 


async function testDownloadAsText(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(localTestFile, testFileName);

	const content = await bucket.downloadAsText(testFileName);
	const localFile = await readFile(localTestFile, 'UTF8');
	strictEqual(content, localFile, 'file content');

}

async function testDownloadRename(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(localTestFile, testFileName);
	const newLocalFilePath = testTmpDir + `new-${testFileName}`;

	await bucket.download(testFileName, newLocalFilePath);

	// check  the file content
	const originalContent = await readFile(localTestFile, 'UTF8');
	const newContent = await readFile(newLocalFilePath, 'UTF8');
	strictEqual(newContent, originalContent, 'files content');

}

//#endregion ---------- /Test Functions ----------


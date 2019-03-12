import { strictEqual } from 'assert';
import { readFile } from 'fs-extra-plus';
import { cleanAll, loadBucketCfg, testTmpDir, generateTests } from './test-utils';


describe('cb-upload', function () {

	generateTests.call(this, {
		'cb-upload-content': testUploadContent
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


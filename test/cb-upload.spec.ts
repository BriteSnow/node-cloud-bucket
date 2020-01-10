import { strictEqual } from 'assert';
import { cleanAll, generateTests, testDir } from './test-utils';


describe('cb-upload', function () {

	generateTests.call(this, {
		'cb-upload-content': testUploadContent,
		'cb-upload-dir': testUploadDir
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
	strictEqual(file!.contentType, 'text/plain');
	strictEqual(content, originalContent);

	await bucket.uploadContent(jsonPath, originalContent);
	content = await bucket.downloadAsText(txtPath);
	file = await bucket.getFile(txtPath);
	strictEqual(file!.contentType, 'text/plain');
	strictEqual(content, originalContent);
}

async function testUploadDir(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(testDir, 'some-remote-base/');

	const remoteFiles = await bucket.list();
	strictEqual(remoteFiles.length, 4); // TODO: needs to check each file name at least
}

//#endregion ---------- /Test Functions ----------


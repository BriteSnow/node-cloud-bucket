import { deepStrictEqual as equal } from 'assert';
import { readFile } from 'fs-extra-plus';
import { getBucket } from '../src';
import { cleanAll, generateTests, TEST_DIR, TEST_FILE_LOCALPATH_01, TEST_FILE_NAME_01 } from './test-utils';


describe('cb-upload', function () {

	generateTests.call(this, {
		'cb-upload-file': testUploadFile,
		'cb-upload-content': testUploadContent,
		'cb-upload-dir': testUploadDir
	});

});

//#region    ---------- Test Functions ---------- 
async function testUploadFile(rawCfg: any) {
	const bucket = await getBucket(rawCfg);

	await bucket.upload(TEST_FILE_LOCALPATH_01, TEST_FILE_NAME_01);
	const fileContent = await readFile(TEST_FILE_LOCALPATH_01, 'UTF8');
	const remoteContent = await bucket.downloadAsText(TEST_FILE_NAME_01);
	equal(remoteContent, fileContent);
}


async function testUploadContent(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);
	const txtPath = 'test-content.txt';
	const jsonPath = 'test-content.json';

	const originalContent = '{"some": "content",\n"val": 2}';

	await bucket.uploadContent(txtPath, originalContent);
	let content = await bucket.downloadAsText(txtPath);
	let file = await bucket.getFile(txtPath);
	equal(file!.contentType, 'text/plain');
	equal(content, originalContent);

	await bucket.uploadContent(jsonPath, originalContent);
	content = await bucket.downloadAsText(txtPath);
	file = await bucket.getFile(txtPath);
	equal(file!.contentType, 'text/plain');
	equal(content, originalContent);
}

async function testUploadDir(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(TEST_DIR, 'some-remote-base/');

	const remoteFiles = await bucket.listFiles();
	equal(remoteFiles.length, 4); // TODO: needs to check each file name at least
}

//#endregion ---------- /Test Functions ----------


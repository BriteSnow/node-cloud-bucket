import { ok, rejects, strictEqual } from 'assert';
import { cleanAll, generateTests, TEST_FILE_LOCALPATH_01 } from './test-utils.js';

const remoteFile01 = 'test-file-01.txt';
const remoteFile02 = 'test-file-02.txt';
const testCopyFile = 'test-copy-file.txt';

describe('cb-copy', function () {

	generateTests.call(this, {
		'cb-copy-to-dir': testCopyToDir,
		'cb-copy-to-file': testCopyToFile
	});

});

//#region    ---------- Test Functions ---------- 

async function testCopyToDir(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	// upload file
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile01);

	// Test Success: copy file
	await bucket.copy(remoteFile01, 'test-copy-dir/');

	// Test basic list
	const files = await bucket.listFiles();
	strictEqual(files.length, 2, 'One file uploaded, one file copied');
}

async function testCopyToFile(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	// upload file
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile01);
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile02);

	// Test Exception: can't copy multiple files 
	await rejects(async function () {
		return bucket.copy('test*.txt', testCopyFile);
	}, /Cannot copy multiple files.*/ig);

	// Test success
	await bucket.copy(remoteFile01, testCopyFile);

	// Test content
	const originalContent = await bucket.downloadAsText(remoteFile01);
	const destContent = await bucket.downloadAsText(testCopyFile);
	strictEqual(destContent, originalContent);

	const originalFile = await bucket.getFile(remoteFile01);
	const destFile = await bucket.getFile(testCopyFile);
	ok(originalFile, 'originalFile');
	ok(destFile, 'destFile');
	strictEqual(destFile!.contentType, destFile!.contentType);


}
//#endregion ---------- /Test Functions ----------


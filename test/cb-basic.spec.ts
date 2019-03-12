import { fail, ok, strictEqual } from 'assert';
import { getBucket } from '../src/index';
import { checkIsoDate, cleanAll, generateTests, testLocalFilePath, testFileName } from './test-utils';


const remoteFile01 = 'test-file-01.txt';
const remoteFile02 = 'test-dir/test-file-02.txt';
const remoteFile03 = 'test-dir/test-file-03.txt';
const remoteFile04 = 'test-dir/sub-dir/test-file-sub-03.txt';



describe('cb-basic', function () {

	generateTests.call(this, {
		'cb-basic-getFile': testGetFile,
		'cb-basic-getFile-null': testGetFileNull,
		'cb-basic-exists': testExists,
		'cb-basic-updated': testUpdated,
		'cb-basic-list': testList
	});

});

//#region    ---------- Test Functions ---------- 
async function testExists(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	let exists = await bucket.exists(testFileName);
	strictEqual(exists, false, 'File should not exists');

	await bucket.upload(testLocalFilePath, testFileName);
	exists = await bucket.exists(testFileName);
	strictEqual(exists, true, 'File should exists');
}

async function testGetFile(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);
	await bucket.upload(testLocalFilePath, remoteFile01);

	const file = await bucket.getFile(remoteFile01);
	if (!file) {
		fail(`No bucket file found for ${remoteFile01}`);
		return;
	}
	strictEqual(file.path, remoteFile01)
	strictEqual(file.size, 12);
	ok(file.contentType, 'Has contentType');
	ok(file.updated, 'Has updated');

}


async function testGetFileNull(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	// Should not throw an exception when not found, just return null
	const file = await bucket.getFile(remoteFile01);
	strictEqual(file, null, 'should be null');

	// TODO: change rawCfg for to test that auth exception are propagated
}

async function testUpdated(rawCfg: any) {
	// clean and upload one test file
	const bucket = await cleanAll(rawCfg);
	await bucket.upload(testLocalFilePath, remoteFile01);

	// check that the getFile return correct date format
	const file = await bucket.getFile(remoteFile01);
	ok(file, `bucket file for ${remoteFile01} not found`);
	checkIsoDate(file!.updated);

	// check that list return correct date format
	const files = await bucket.list(remoteFile01);
	ok(files.length === 1, `list(${remoteFile01}) return incorrect match ${files.length}`);
	for (const file of files) {
		checkIsoDate(file.updated);
	}
}



async function testList(rawCfg: any) {
	const bucket = await getBucket(rawCfg);
	// Clean test space
	await cleanAll(rawCfg);

	// Test the above 
	let files = await bucket.list();
	strictEqual(files.length, 0, 'Post cleanup (should be 0)');

	// Test upload
	await bucket.upload(testLocalFilePath, remoteFile01);
	await bucket.upload(testLocalFilePath, remoteFile02);
	await bucket.upload(testLocalFilePath, remoteFile03);
	await bucket.upload(testLocalFilePath, remoteFile04);

	// Test basic list
	files = await bucket.list();
	strictEqual(files.length, 4, 'All files');

	// Test list with simple prefix
	files = await bucket.list('test-dir/');
	strictEqual(files.length, 3, '"test-dir/" files');

	// Test list with glob
	files = await bucket.list('test-dir/**/*-03.txt');
	strictEqual(files.length, 2, '"test-dir/**/*-03.txt" files');
}




//#endregion ---------- /Test Functions ----------


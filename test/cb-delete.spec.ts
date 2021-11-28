import { strictEqual } from 'assert';
import { cleanAll, generateTests, TEST_FILE_LOCALPATH_01 } from './test-utils.js';


const remoteFile01 = 'test-file-01.txt';
const remoteFile02 = 'test-dir/test-file-02.txt';
const remoteFile03 = 'test-dir/test-file-03.txt';
const remoteFile04 = 'test-dir/sub-dir/test-file-sub-03.txt';


describe('cb-delete', function () {

	generateTests.call(this, {
		'cb-delete-not-found': testDeleteNotFound,
		'cb-delete-all': testDeleteAll
	});

});

//#region    ---------- Test Functions ---------- 

async function testDeleteNotFound(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	let deleted = await bucket.delete(remoteFile01);
	strictEqual(deleted, false, 'Nothing should have been deleted');

	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile01);
	deleted = await bucket.delete(remoteFile01);
	strictEqual(deleted, true, 'Something has been deleted');

}

async function testDeleteAll(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	// Upload the data
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile01);
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile02);
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile03);
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile04);

	// check that we have the right number of files
	let files = await bucket.listFiles();
	strictEqual(files.length, 4, 'before delete all');

	// deleteAll chekc that we have 0 files
	let deletedFiles = await bucket.deleteAll(files);
	strictEqual(deletedFiles.length, 4, 'should have 4 deleted files')
	files = await bucket.listFiles();
	strictEqual(files.length, 0, 'after delete all');

	// redelete deleted files, the deletedFiles.lenght === 0 and no error thrown on not found
	deletedFiles = await bucket.deleteAll(files);
	strictEqual(deletedFiles.length, 0, 'should have 0 deleted files')
}




//#endregion ---------- /Test Functions ----------

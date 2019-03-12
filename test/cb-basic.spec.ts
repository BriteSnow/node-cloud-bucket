import { rejects, strictEqual, fail, ok } from 'assert';
import { glob, readFile } from 'fs-extra-plus';
import { basename } from 'path';
import { getBucket } from '../src/index';
import { cleanAll, cleanTmpDir, loadBucketCfg, checkIsoDate, generateTests, testLocalFilePath } from './test-utils';


const remoteFile01 = 'test-file-01.txt';
const remoteFile02 = 'test-dir/test-file-02.txt';
const remoteFile03 = 'test-dir/test-file-03.txt';
const remoteFile04 = 'test-dir/sub-dir/test-file-sub-03.txt';

const testTmpDir = './test-data/~tmp/';


describe('cb-basic', function () {

	generateTests.call(this, {
		'cb-basic-updated': testUpdated,
		'cb-basic-getFile': testGetFile,
		'cb-basic-basic': testBasic,
		'cb-basic-download': testDownload,
		'cb-basic-download-glob': testDownloadGlob
	});

});

//#region    ---------- Test Functions ---------- 
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

async function testBasic(rawCfg: any) {
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


async function testDownloadGlob(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(testLocalFilePath, remoteFile01);
	await bucket.upload(testLocalFilePath, remoteFile02);
	await bucket.upload(testLocalFilePath, remoteFile03);
	await bucket.upload(testLocalFilePath, remoteFile04);

	// download with glob
	let bfiles = await bucket.download('test-dir/**/*-03.txt', testTmpDir);
	strictEqual(bfiles.length, 2);
	strictEqual(bfiles[0].path, 'test-dir/sub-dir/test-file-sub-03.txt')
	strictEqual(bfiles[0].local, './test-data/~tmp/sub-dir/test-file-sub-03.txt')

	let localFiles = await glob(testTmpDir + '**/*.*');
	strictEqual(localFiles.length, 2);

	// download from folder
	await cleanTmpDir();
	await bucket.download('test-dir/', testTmpDir);
	localFiles = await glob(testTmpDir + '**/*.*');
	strictEqual(3, localFiles.length); // 3 because remoteFile01 is not under 'test-dir/'
}

async function testDownload(rawCfg: any) {
	const bucket = await getBucket(rawCfg);

	// Clean test space
	await cleanAll(rawCfg);

	// upload file
	await bucket.upload(testLocalFilePath, remoteFile01);

	// download file
	const [remoteFile] = await bucket.download(remoteFile01, testTmpDir);

	const str = await readFile(testTmpDir + basename(remoteFile.path), 'UTF8');
	strictEqual(str, 'test file 01');
}


//#endregion ---------- /Test Functions ----------


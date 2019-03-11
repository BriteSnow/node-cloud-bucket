import { rejects, strictEqual, fail, ok } from 'assert';
import { glob, readFile } from 'fs-extra-plus';
import { basename } from 'path';
import { getBucket } from '../src/index';
import { cleanAll, cleanTmpDir, loadBucketCfg } from './test-utils';


const testDir = './test-data/'
const localTestFile = testDir + 'test-file.txt';

const remoteFile01 = 'test-file-01.txt';
const remoteFile02 = 'test-dir/test-file-02.txt';
const remoteFile03 = 'test-dir/test-file-03.txt';
const remoteFile04 = 'test-dir/sub-dir/test-file-sub-03.txt';

const testTmpDir = './test-data/~tmp/';

describe('cb-basic', function () {

	it('cb-basic-getFile-gcp', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testGcp');
		await testGetFile.call(this, cfg);
	});

	it('cb-basic-getFile-aws', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testAws');
		await testGetFile.call(this, cfg);
	});

	it('cb-basic-basic-gcp', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testGcp');
		await testBasic.call(this, cfg);
	});

	it('cb-basic-basic-aws', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testAws');
		await testBasic.call(this, cfg);
	});

	it('cb-basic-download-gcp', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testGcp');
		await testDownload.call(this, cfg);
	});

	it('cb-basic-download-aws', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testAws');
		await testDownload.call(this, cfg);
	});

	it('cb-basic-download-glob-gcp', async function () {
		this.timeout(15000);
		const cfg = await loadBucketCfg('testGcp');
		await testDownloadGlob.call(this, cfg);
	});

	it('cb-basic-download-glob-aws', async function () {
		this.timeout(15000);
		const cfg = await loadBucketCfg('testAws');
		await testDownloadGlob.call(this, cfg);
	});

	it('cb-basic-copy-gcp', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testGcp');
		await testCopy.call(this, cfg);
	});

	it('cb-basic-copy-aws', async function () {
		this.timeout(5000);
		const cfg = await loadBucketCfg('testAws');
		await testCopy.call(this, cfg);
	});
});

//#region    ---------- Test Functions ---------- 
async function testGetFile(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);
	await bucket.upload(localTestFile, remoteFile01);

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
	await bucket.upload(localTestFile, remoteFile01);
	await bucket.upload(localTestFile, remoteFile02);
	await bucket.upload(localTestFile, remoteFile03);
	await bucket.upload(localTestFile, remoteFile04);

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

	await bucket.upload(localTestFile, remoteFile01);
	await bucket.upload(localTestFile, remoteFile02);
	await bucket.upload(localTestFile, remoteFile03);
	await bucket.upload(localTestFile, remoteFile04);

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
	await bucket.upload(localTestFile, remoteFile01);

	// download file
	const [remoteFile] = await bucket.download(remoteFile01, testTmpDir);

	const str = await readFile(testTmpDir + basename(remoteFile.path), 'UTF8');
	strictEqual(str, 'test file 01');
}

async function testCopy(rawCfg: any) {
	const bucket = await getBucket(rawCfg);

	// Clean test space
	await cleanAll(rawCfg);

	// upload file
	await bucket.upload(localTestFile, remoteFile01);

	// Test Exception: wrong arg, just end with / 
	await rejects(async function () {
		return bucket.copy(remoteFile01, 'test-copy');
	}, /CS ERROR - destDir must end with '\/'/ig);

	// Test Success: copy file
	await bucket.copy(remoteFile01, 'test-copy/');

	// Test basic list
	const files = await bucket.list();
	strictEqual(files.length, 2, 'One file uploaded, one file copied');
}
//#endregion ---------- /Test Functions ----------


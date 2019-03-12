import { strictEqual } from 'assert';
import { glob, readFile } from 'fs-extra-plus';
import { basename } from 'path';
import { cleanAll, cleanTmpDir, generateTests, testFileName, testLocalFilePath, testTmpDir } from './test-utils';



const remoteFile01 = 'test-file-01.txt';
const remoteFile02 = 'test-dir/test-file-02.txt';
const remoteFile03 = 'test-dir/test-file-03.txt';
const remoteFile04 = 'test-dir/sub-dir/test-file-sub-03.txt';


describe('cb-download', function () {

	generateTests.call(this, {
		'cb-download-as-text': testDownloadAsText,
		'cb-download-rename': testDownloadRename,
		'cb-basic-download': testDownload,
		'cb-basic-download-glob': testDownloadGlob
	});
});

//#region    ---------- Test Functions ---------- 


async function testDownloadAsText(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(testLocalFilePath, testFileName);

	const content = await bucket.downloadAsText(testFileName);
	const localFile = await readFile(testLocalFilePath, 'UTF8');
	strictEqual(content, localFile, 'file content');

}

async function testDownloadRename(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(testLocalFilePath, testFileName);
	const newLocalFilePath = testTmpDir + `new-${testFileName}`;

	await bucket.download(testFileName, newLocalFilePath);

	// check  the file content
	const originalContent = await readFile(testLocalFilePath, 'UTF8');
	const newContent = await readFile(newLocalFilePath, 'UTF8');
	strictEqual(newContent, originalContent, 'files content');

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
	const bucket = await cleanAll(rawCfg);

	// upload file
	await bucket.upload(testLocalFilePath, remoteFile01);

	// download file
	const [remoteFile] = await bucket.download(remoteFile01, testTmpDir);

	const str = await readFile(testTmpDir + basename(remoteFile.path), 'UTF8');
	strictEqual(str, 'test file 01');
}

//#endregion ---------- /Test Functions ----------


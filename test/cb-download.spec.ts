import { strictEqual } from 'assert';
import { glob, readFile } from 'fs-extra-plus';
import { cleanAll, cleanTmpDir, generateTests, TEST_FILE_LOCALPATH_01, TEST_FILE_NAME_01, TEST_TMP_DIR } from './test-utils';


const remoteFile01 = 'test-file-01.txt';
const remoteFile02 = 'test-dir/test-file-02.txt';
const remoteFile03 = 'test-dir/test-file-03.txt';
const remoteFile04 = 'test-dir/sub-dir/test-file-sub-03.txt';


describe('cb-download', function () {

	generateTests.call(this, {
		'cb-download-as-text': testDownloadAsText,
		'cb-download-rename': testDownloadRename,
		'cb-download-basic': testDownload,
		'cb-download-glob': testDownloadGlob
	});
});

//#region    ---------- Test Functions ---------- 


async function testDownloadAsText(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(TEST_FILE_LOCALPATH_01, TEST_FILE_NAME_01);

	const content = await bucket.downloadAsText(TEST_FILE_NAME_01);
	const localFile = await readFile(TEST_FILE_LOCALPATH_01, 'UTF8');
	strictEqual(content, localFile, 'file content');

}

async function testDownloadRename(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(TEST_FILE_LOCALPATH_01, TEST_FILE_NAME_01);
	const newLocalFilePath = TEST_TMP_DIR + `new-${TEST_FILE_NAME_01}`;

	await bucket.download(TEST_FILE_NAME_01, newLocalFilePath);

	// check  the file content
	const originalContent = await readFile(TEST_FILE_LOCALPATH_01, 'UTF8');
	const newContent = await readFile(newLocalFilePath, 'UTF8');
	console.log('org>>>>\n', originalContent)
	console.log('new>>>>\n', newContent)
	strictEqual(newContent, originalContent, 'files content');

}

async function testDownloadGlob(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile01);
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile02);
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile03);
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile04);

	// download with glob
	let bfiles = await bucket.download('test-dir/**/*-03.txt', TEST_TMP_DIR);
	strictEqual(bfiles.length, 2);
	strictEqual(bfiles[0].path, 'test-dir/sub-dir/test-file-sub-03.txt');
	strictEqual(bfiles[0].local, `${TEST_TMP_DIR}sub-dir/test-file-sub-03.txt`);

	let localFiles = await glob(TEST_TMP_DIR + '**/*.*');
	strictEqual(localFiles.length, 2);

	// download from folder
	await cleanTmpDir();
	await bucket.download('test-dir/', TEST_TMP_DIR);
	localFiles = await glob(TEST_TMP_DIR + '**/*.*');
	strictEqual(3, localFiles.length); // 3 because remoteFile01 is not under 'test-dir/'
}

async function testDownload(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	// upload file
	await bucket.upload(TEST_FILE_LOCALPATH_01, remoteFile01);

	// download file
	await bucket.download(remoteFile01, TEST_TMP_DIR);

	// downloaded file 
	const downloadedFile = TEST_TMP_DIR + remoteFile01;
	const str = await readFile(downloadedFile, 'UTF8');
	strictEqual(str, 'test file 01');
}

//#endregion ---------- /Test Functions ----------


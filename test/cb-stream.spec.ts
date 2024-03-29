import { deepStrictEqual as equal } from 'assert';
import { getBucket } from '../src/index.js';
import { generateTests, TEST_FILE_LOCALPATH_01, TEST_FILE_NAME_01 } from './test-utils.js';
const { readFile, createReadStream } = (await import('fs-extra')).default;


describe('cb-stream', function () {

	generateTests.call(this, {
		'cb-stream-upload': testStreamUpload
	});

});

//#region    ---------- Test Functions ---------- 
async function testStreamUpload(rawCfg: any) {
	const bucket = await getBucket(rawCfg);
	const fileContentExpected = await readFile(TEST_FILE_LOCALPATH_01, 'UTF8');

	const testPath = TEST_FILE_NAME_01;
	await bucket.delete(testPath);

	const readS = createReadStream(TEST_FILE_LOCALPATH_01);
	const writeS = await bucket.createWriteStream(testPath);
	const ww = readS.pipe(writeS);

	await new Promise<void>((res, rej) => {
		ww.on('finish', () => {
			res();
		});
	});

	const remoteContent = await bucket.downloadAsText(testPath);
	equal(remoteContent, fileContentExpected);

}


//#endregion ---------- /Test Functions ----------


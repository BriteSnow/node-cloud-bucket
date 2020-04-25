import { deepStrictEqual as equal } from 'assert';
import { cleanAll, generateTests, TEST_DIR } from './test-utils';


const remoteFile01 = 'test-file-01.txt';
const remoteFile02 = 'test-dir/test-file-02.txt';
const remoteFile03 = 'test-dir/test-file-03.txt';
const remoteFile04 = 'test-dir/sub-dir/test-file-sub-03.txt';


describe('cb-list', function () {

	generateTests.call(this, {
		'cb-list-base': testListBase
	});

});

//#region    ---------- Test Functions ---------- 

async function testListBase(rawCfg: any) {
	// Clean test space
	const bucket = await cleanAll(rawCfg);
	await bucket.upload(TEST_DIR, 'cp-list-base/');
	// const bucket = await getBucket(rawCfg);

	// Test the above 
	let result = await bucket.list({ prefix: 'cp-list-base/', directory: true, limit: 3 });
	equal(result.dirs?.length, 1);
	equal(result.files.length, 2);

	result = await bucket.list({ prefix: 'cp-list-base/', directory: true, marker: result.nextMarker, limit: 3 });
	equal(result.dirs?.length, undefined);
	equal(result.files.length, 1);


}
//#endregion ---------- /Test Functions ----------


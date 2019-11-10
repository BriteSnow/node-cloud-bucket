import { strictEqual } from 'assert';
import { cleanAll, generateTests, testDir } from './test-utils';


describe('cb-content-type', function () {

	generateTests.call(this, {
		'cb-content-type': testContentType
	});

});

//#region    ---------- Test Functions ---------- 

async function testContentType(rawCfg: any) {
	const bucket = await cleanAll(rawCfg);

	// file names with their expected content type
	const items = [{ name: 'test-file-04.html', ct: 'text/html' }, { name: 'test-file-02.json', ct: 'application/json' }];

	for (const item of items) {
		await bucket.upload(`${testDir}/${item.name}`, item.name);
		const file = await bucket.getFile(item.name);
		strictEqual(file?.contentType, item.ct);
	}

}


//#endregion ---------- /Test Functions ----------


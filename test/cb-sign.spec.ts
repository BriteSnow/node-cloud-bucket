import * as fs from 'fs-extra-plus';
import { getBucket, SignOptions } from '../src';
import { cdnSign } from '../src/cdn-signer';
import { generateTests, loadYaml } from './test-utils';

describe('cb-sign', function () {

	generateTests.call(this, {
		'cb-sign-basic': testSignBasic
	});
});



async function testSignBasic(rawCfg: any) {
	let test_signs: any = (await loadYaml('./test-data/~test-buckets.yaml')).test_signs;

	// const bucket = await cleanAll(rawCfg);
	const bucket = await getBucket(rawCfg);

	const testSign = test_signs[bucket.type];

	const url = testSign.urls[0]; // for not test, only one url

	const opts: SignOptions = {
		type: bucket.type as 's3' | 'gs',
		key: testSign.key,
		keyName: testSign.keyName,
		expires: new Date().getTime() + 3600
	}

	const signedUrl = cdnSign(url, opts);

	// TODO: do a http get to check if content exist
	console.log(`signedUrl ${bucket.type} : \n\t${signedUrl}`);

}

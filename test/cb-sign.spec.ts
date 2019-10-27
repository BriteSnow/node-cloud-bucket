import { performance } from 'perf_hooks';
import { getBucket, signUrl, SignUrlOptions } from '../src';
import { generateTests, loadYaml } from './test-utils';

const IT = 100;

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

	const opts: SignUrlOptions = {
		type: bucket.type as 's3' | 'gs',
		key: testSign.key,
		keyName: testSign.keyName,
		expires: new Date().getTime() + 3600
	}
	const start = performance.now();
	for (let i = 0; i < IT; i++) {
		signUrl(url + i, opts);
	}
	const end = performance.now();

	const signedUrl = signUrl(url, opts);

	// TODO: do a http get to check if content exist
	// console.log(`${bucket.type} signedUrl\n\tPerf ${end - start}ms for ${IT} signatures\n\tUrl: ${signedUrl}`);

}

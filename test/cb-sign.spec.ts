import * as Path from 'path';
import { performance } from 'perf_hooks';
import { getBucket, signUrl, SignUrlOptions } from '../src';
import { urlSigner } from '../src/url-signer';
import { generateTests, loadYaml } from './test-utils';

const IT = 100;

describe('cb-sign', function () {
	generateTests.call(this, {
		'cb-sign-basic': testSignBasic,
		'cb-sign-signer': testSigner
	});

	// it('cb-sign-xp', async function () {
	// 	const yamlData = await loadYaml('./test-data/.test-buckets.yaml');
	// 	let xp_sign_opts: any = yamlData.xp_sign as { key: string, keyName: string };
	// 	// console.log(xp_sign_opts);
	// 	const opts: SignUrlOptions = {
	// 		type: 's3',
	// 		key: xp_sign_opts.key.trim() + '\n',
	// 		keyName: xp_sign_opts.keyName,
	// 		expires: new Date().getTime() + 3600 // one hour
	// 	};
	// 	const baseUrl = 'https://d1jn6p6krygb1m.cloudfront.net/';
	// 	// const path = 'verb-dev-di-store/ec2-user/cases/case-000000000001/research-portal-user-personas-draft-not-for-review-2020-04-14.png';
	// 	// const path = 'verb-dev-di-store/ec2-user/cases/case-000000000001/video-original.mp4';
	// 	// const path = 'verb-dev-di-store/ec2-user/cases/case-000000000001/result.csv';
	// 	const path = 'verb-dev-di-store/ec2-user/cases/case-000000000001/small.mp4';
	// 	const url = `${baseUrl}${path}`;
	// 	const signedUrl = signUrl(url, opts);
	// 	console.log(signedUrl);
	// });
});

async function testSignBasic(rawCfg: any) {
	let test_signs: any = (await loadYaml('./test-data/.test-buckets.yaml')).test_signs;

	// const bucket = await cleanAll(rawCfg);
	const bucket = await getBucket(rawCfg);

	const testSign = test_signs[bucket.type];

	const url = testSign.urls[0]; // for not test, only one url

	const opts: SignUrlOptions = {
		type: bucket.type as 's3' | 'gs',
		key: testSign.key,
		keyName: testSign.keyName,
		expires: new Date().getTime() + 3600 // one hour
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

async function testSigner(rawCfg: any) {
	const bucket = await getBucket(rawCfg);
	const test_signs: any = (await loadYaml('./test-data/.test-buckets.yaml')).test_signs;
	const testSign = test_signs[bucket.type];

	const opts: SignUrlOptions = {
		type: bucket.type as 's3' | 'gs',
		key: testSign.key,
		keyName: testSign.keyName,
		expires: new Date().getTime() + 3600 // one hour
	}

	const start = performance.now();

	const url = testSign.urls[0];
	const urlParts = Path.parse(url);
	const baseUrl = urlParts.dir + '/*'; // this will be the http.... until the last "/"

	const signer = urlSigner(baseUrl, opts);

	const filePath = urlParts.base; // file name
	for (let i = 0; i < IT; i++) {
		signer(filePath);
	}
	const end = performance.now();

	const signedUrl = signer(filePath);

	// TODO: do a http get to check if content exist
	// console.log(`${bucket.type} signedUrl\n\tPerf ${end - start}ms for ${IT} signatures\n\tUrl: ${signedUrl}`);

}

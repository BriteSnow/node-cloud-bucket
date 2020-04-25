import { Bucket, newBucket } from './bucket';
import { Driver } from './driver';
import { getS3Driver, S3DriverCfg } from './driver-aws';
import { getGsDriver, GsDriverCfg } from './driver-gcp';
import { BucketFile, ListOptions, ListResult } from './types';

export { signUrl, SignUrlOptions, urlSigner } from './url-signer';
export { Bucket, BucketFile, ListOptions, ListResult };



export async function getBucket(rawCfg: any): Promise<Bucket> {

	// if has .project_id, assume GcpBucket
	const driver = await getDriver(rawCfg);
	const bucket = newBucket({ driver });
	return bucket;

}


async function getDriver(rawCfg: any): Promise<Driver> {
	if (rawCfg.project_id) {
		return getGsDriver(rawCfg as GsDriverCfg);
	} else if (rawCfg.access_key_id) {
		return getS3Driver(rawCfg as S3DriverCfg);
	}
	else {
		throw new Error(`bucket config does not seem to be valid (only support Gcp and Aws for now)`);

	}
}


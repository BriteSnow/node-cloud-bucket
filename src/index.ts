import { AwsBucketCfg, getAwsBucket } from './bucket-aws';
import { Bucket, BucketFile } from './bucket-base';
import { GcpBucketCfg, getGcpBucket } from './bucket-gcp';

export { signUrl, SignUrlOptions, urlSigner } from './url-signer';
export { Bucket, BucketFile };



export async function getBucket(rawCfg: any): Promise<Bucket> {

	// if has .project_id, assume GcpBucket
	if (rawCfg.project_id) {
		return getGcpBucket(rawCfg as GcpBucketCfg);
	} else if (rawCfg.access_key_id) {
		return getAwsBucket(rawCfg as AwsBucketCfg);
	}
	else {
		throw new Error(`bucket config does not seem to be valid (only support Gcp and Aws for now)`);
	}

}


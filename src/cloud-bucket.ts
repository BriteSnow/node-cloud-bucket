import { Bucket } from './cloud-bucket-base';
import { GcpBucketCfg, getGcpBucket } from './cloud-bucket-gcp';
import { getAwsBucket, AwsBucketCfg } from './cloud-bucket-aws';


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


import { Bucket, newBucket } from './bucket';
import { Driver } from './driver';
import { getS3Driver, S3DriverCfg } from './driver-aws';
import { getGsDriver, GsDriverCfg } from './driver-gcp';
import { getMinioDriver, MinioDriverCfg } from './driver-minio';
import { BucketFile, ListOptions, ListResult } from './types';

export { signUrl, SignUrlOptions, urlSigner } from './url-signer';
export { Bucket, BucketFile, ListOptions, ListResult };

type GetBucketOptions = { log?: boolean } & (GsDriverCfg | S3DriverCfg | MinioDriverCfg);

export async function getBucket(options: GetBucketOptions): Promise<Bucket> {
	if (options == null) {
		throw new Error(`ERROR - cloud-bucket - Cannot getBucket with options ${options}`);
	}
	const log = options.log ?? false; // by default, false. 
	// if has .project_id, assume GcpBucket
	const driver = await getDriver(options);
	const bucket = newBucket({ driver, log });
	return bucket;
}

async function getDriver(driverCfg: GsDriverCfg | S3DriverCfg | MinioDriverCfg): Promise<Driver> {
	if (isGsDriverCfg(driverCfg)) {
		return getGsDriver(driverCfg);
	} else if (isMinioDriverCfg(driverCfg)) { // IMPORTANT MUST be before S3Driver, because same access_key... 
		return getMinioDriver(driverCfg);
	} else if (isS3DriverCfg(driverCfg)) {
		return getS3Driver(driverCfg);
	} else {
		throw new Error(`bucket config does not seem to be valid (only support Gcp and Aws for now)`);
	}
}

function isGsDriverCfg(opts: any): opts is GsDriverCfg {
	return opts.hasOwnProperty('project_id');
}

function isS3DriverCfg(opts: any): opts is S3DriverCfg {
	return opts.hasOwnProperty('access_key_id');
}

function isMinioDriverCfg(opts: any): opts is MinioDriverCfg {
	return opts.hasOwnProperty('minio_endpoint') && opts.minio_endpoint != null;
}


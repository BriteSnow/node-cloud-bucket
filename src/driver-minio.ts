import type { S3 as S3_TYPE } from 'aws-sdk';
import { S3Driver, S3DriverCfg } from './driver-aws.js';
import { BucketType } from './types.js';
const { S3 } = (await import('aws-sdk')).default;

export interface MinioDriverCfg extends S3DriverCfg {
	minio_endpoint: string;
}

export async function getMinioDriver(cfg: MinioDriverCfg) {
	// const credentials = new Credentials(cfg.access_key_id, cfg.access_key_secret);
	const s3 = new S3({
		accessKeyId: cfg.access_key_id,
		secretAccessKey: cfg.access_key_secret,
		endpoint: cfg.minio_endpoint,
		s3ForcePathStyle: true, // needed with minio (otherwise bucket.locahost and get address not found)
		signatureVersion: 'v4'
	});

	// For Minio, assume mock mode, so, auto create bucket
	if (!(await bucketExists(s3, cfg.bucketName))) {
		await createBucket(s3, cfg.bucketName);
	}

	// Create S3 service object
	return new MinioDriver(s3, cfg.bucketName);
}

class MinioDriver extends S3Driver {
	get type(): BucketType {
		return 'minio'
	}
}



async function bucketExists(s3: S3_TYPE, bucketName: string) {

	return new Promise((res, rej) => {
		s3.headBucket({
			Bucket: bucketName
		}, (err, data) => {
			(err) ? res(false) : res(true);
		})
	});

}

async function createBucket(s3: S3_TYPE, bucketName: string) {

	// create the bucket
	await new Promise((res, rej) => {
		s3.createBucket({
			// ACL: 'public-read-write', // Does not see have effect on minio, see below
			Bucket: bucketName
		}, function (err, data) {
			(err) ? rej(err) : res(data);
		});
	});

	// set it public
	await new Promise((res, rej) => {
		s3.putBucketPolicy({
			Bucket: bucketName,
			Policy: `{ "Version": "2012-10-17", "Statement": [{ "Sid": "MakeItPublic", "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::${bucketName}/*" }] }'`
		}, function (err, data) {
			(err) ? rej(err) : res(data);
		});
	})

}


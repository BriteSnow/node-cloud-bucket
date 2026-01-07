import { HeadBucketCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { S3Driver, S3DriverCfg } from './driver-aws.js';
import { BucketType } from './types.js';

export interface MinioDriverCfg extends S3DriverCfg {
	minio_endpoint: string;
}

export async function getMinioDriver(cfg: MinioDriverCfg) {
	// const credentials = new Credentials(cfg.access_key_id, cfg.access_key_secret);
	let region = process.env.AWS_REGION || 'us-east-1';
	const s3 = new S3Client({
		region,
		credentials: {
			accessKeyId: cfg.access_key_id,
			secretAccessKey: cfg.access_key_secret
		},
		endpoint:cfg.minio_endpoint,
		forcePathStyle: true, // needed with minio (otherwise bucket.locahost and get address not found)
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



async function bucketExists(s3: S3Client, bucketName: string) {
	return new Promise(async (res, rej) => {
		try {
			const command = new HeadBucketCommand({
				Bucket: bucketName
			});
			const data = await s3.send(command);
			res(data);
		} catch (error) {
			rej(error);
		}
	});
}

async function createBucket(s3: S3Client, bucketName: string) {

	// create the bucket
	await new Promise(async (res, rej) => {
		try {
			const command = new HeadBucketCommand({
				// ACL: 'public-read-write', // Does not see have effect on minio, see below
				Bucket: bucketName
			});
			const data = await s3.send(command);
			res(data);
		} catch (error) {
			rej(error);
		}
	});

	// set it public
	await new Promise(async (res, rej) => {
		try {
			const command = new PutBucketPolicyCommand({
				Bucket: bucketName,
				Policy: `{ "Version": "2012-10-17", "Statement": [{ "Sid": "MakeItPublic", "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::${bucketName}/*" }] }'`
			});
			const data = await s3.send(command);
			res(data);
		} catch (error) {
			rej(error);
		}
	})

}


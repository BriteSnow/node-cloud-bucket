import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, ListObjectsV2Request, PutObjectCommand, _Object as S3_TYPE, S3Client } from '@aws-sdk/client-s3';
import { Upload } from "@aws-sdk/lib-storage";
import { PassThrough, Readable, Writable } from "stream";
import { Driver, ListCloudFilesOptions, ListCloudFilesResult } from "./driver";
import { BucketFile, BucketType } from './types';
const micromatch = (await import('micromatch')).default;
const { createReadStream, createWriteStream } = (await import('fs-extra')).default;

// import {Object as AwsFile} from 'aws-sdk';

// type S3 = AWS.S3;
type AwsFile = S3_TYPE & { ContentType?: string };

export interface S3DriverCfg {
	bucketName: string;
	access_key_id: string;
	access_key_secret: string;
}

export async function getS3Driver(cfg: S3DriverCfg) {
	// Create S3 service object
	let region = process.env.AWS_REGION || 'us-east-1';
	const s3 = new S3Client({ 
		region,
		apiVersion: '2006-03-01', 
		credentials: {
			accessKeyId: cfg.access_key_id,
			secretAccessKey: cfg.access_key_secret
		}
	});
	return new S3Driver(s3, cfg.bucketName);
}

/** 
 * Custom Writable to trigger finish/close event manually on upload 
 * TODO: Needs to check if this create some side effect. 
 */
class S3UploadWriteStream extends PassThrough {
	emit(event: any): boolean {
		if (event !== 'finish' && event !== 'close') {
			super.emit(event);
			return true;
		} else {
			return false;
		}
	}

	triggerFinishAndClose() {
		super.emit('finish');
		super.emit('close');
	}
}

export class S3Driver implements Driver<AwsFile> {
	private s3: S3Client;
	private baseParams: { Bucket: string };

	get type(): BucketType {
		return 's3'
	}

	get name(): string {
		return this.baseParams.Bucket;
	}

	constructor(s3: S3Client, bucketName: string) {
		this.s3 = s3;
		this.baseParams = { Bucket: bucketName };
	}

	toFile(awsFile: AwsFile): Omit<BucketFile, 'bucket'> {
		if (!awsFile) {
			throw new Error(`No awsFile`);
		}
		const updated = (awsFile.LastModified) ? awsFile.LastModified.toISOString() : undefined;
		return {
			path: awsFile.Key!,
			size: awsFile.Size,
			contentType: awsFile.ContentType,
			updated: updated
		}
	}

	getPath(obj: AwsFile) {
		return obj.Key!; // TODO: need to investigate when Key is empty in S3. 
	}


	async exists(path: string): Promise<boolean> {
		const file = await this.getCloudFile(path);
		return (file) ? true : false;
	}

	async getCloudFile(path: string): Promise<AwsFile | null> {
		try {
			const command = new HeadObjectCommand({
				...this.baseParams,
				...{ Key: path }
			});
			
			const object = await this.s3.send(command);
			// bucket: this,
			// 	path,
			// 	updated,
			// 	size: object.ContentLength,
			// 		contentType: object.ContentType	
			const { ContentLength, ContentType, LastModified, ETag } = object;
			const Key = path;
			const Size = ContentLength;

			const awsFile: AwsFile = { Key, Size, LastModified, ETag, ContentType };
			return awsFile;
		} catch (ex: any) {
			//  if NotFound, return false
			if (ex.code === 'NotFound') {
				return null;
			}
			// otherwise, propagate the exception
			else {
				throw ex;
			}
		}

	}

	async listCloudFiles(opts: ListCloudFilesOptions): Promise<ListCloudFilesResult<AwsFile>> {

		const { prefix, glob, directory, limit, marker } = opts;

		// build the list params
		let listParams: Partial<ListObjectsV2Request> = {};
		if (prefix) {
			listParams.Prefix = prefix;
		}
		if (directory) {
			listParams!.Delimiter = '/';
		}
		if (limit != null) {
			listParams.MaxKeys = limit;
		}
		if (marker != null) {
			listParams.ContinuationToken = marker;
		}
		const params = { ...this.baseParams, ...listParams };

		// perform the s3 list request
		try {
			const command = new ListObjectsV2Command(params);
			const awsResult = await this.s3.send(command);
			const awsFiles = awsResult.Contents as AwsFile[];
			// if glob, filter again the result
			let files: AwsFile[] = (!glob) ? awsFiles : awsFiles.filter(af => micromatch.isMatch(af.Key!, glob));

			let dirs: string[] | undefined = undefined;
			if (directory && awsResult.CommonPrefixes) {
				// Note: for now, match the gcp driver, undefined if empty
				const prefixes = awsResult.CommonPrefixes?.map(cp => cp.Prefix!);
				if (prefixes != null && prefixes.length > 0) {
					dirs = prefixes;
				}
			}
			const nextMarker = awsResult.NextContinuationToken;

			return { files, dirs, nextMarker };
		} catch (ex) {
			throw ex;
		}

	}

	async copyCloudFile(cf: AwsFile, dest: BucketFile): Promise<void> {
		if (dest.bucket.type !== this.type) {
			throw new Error(`destBucket type ${dest.bucket.type} does not match source bucket type ${this.type}. For now, cross bucket type copy not supported.`)
		}
		const sourcePath = cf.Key!;
		const params = {
			CopySource: `${this.name}/${sourcePath}`,
			Bucket: dest.bucket.name,
			Key: dest.path
		}
		const command = new CopyObjectCommand(params);
		await this.s3.send(command);
	}


	async downloadCloudFile(rawFile: AwsFile, localPath: string): Promise<void> {
		const remotePath = rawFile.Key!;
		const params = { ...this.baseParams, ...{ Key: remotePath } };
		const command = new GetObjectCommand(params);
		const remoteReadStream = (await this.s3.send(command)).Body as Readable;
		const localWriteStream = createWriteStream(localPath);
		const writePromise = new Promise<void>((resolve, reject) => {
			localWriteStream.once('close', () => {
				resolve();
			});
			localWriteStream.once('error', (ex) => {
				reject(ex);
			});
			remoteReadStream.pipe(localWriteStream);
		});

		await writePromise;
	}

	async uploadCloudFile(localPath: string, remoteFilePath: string, contentType?: string): Promise<AwsFile> {
		const readable = createReadStream(localPath);
		const command = new PutObjectCommand({ ...this.baseParams, ...{ Key: remoteFilePath, Body: readable, ContentType: contentType } });
		const awsResult = await this.s3.send(command);
		// TODO: probably check the awsResult that match remoteFilePath
		return { Key: remoteFilePath };

	}

	async downloadAsText(path: string): Promise<string> {
		const params = { ...this.baseParams, ...{ Key: path } };
		const command = new GetObjectCommand(params);
		const obj = await await this.s3.send(command);
		const content = obj.Body!.toString();
		return content;
	}

	async uploadCloudContent(path: string, content: string, contentType?: string): Promise<void> {
		const command = new PutObjectCommand({ ...this.baseParams, ...{ Key: path, Body: content, ContentType: contentType } });
		await this.s3.send(command);
	}

	async createReadStream(path: string): Promise<Readable> {
		const params = { ...this.baseParams, ...{ Key: path } };
		const command = new GetObjectCommand(params);
		const obj = await this.s3.send(command);

		if (!obj) {
			throw new Error(`Object not found for ${path}`);
		}
		return obj.Body as Readable;
	}

	async createWriteStream(path: string, contentType?: string): Promise<Writable> {
		const writable = new S3UploadWriteStream();

		const params = { ...this.baseParams, ...{ Key: path, ContentType: contentType }, Body: writable };
		const uploadCtrl = new Upload({
        client: this.s3,
        params: params
    });

		// NOTE: We use the S3UploadWriteStream trigger finish and close stream even when the upload is done
		uploadCtrl.done().then(() => {
			writable.triggerFinishAndClose();
		});

		return writable;
	}

	async deleteCloudFile(path: string): Promise<boolean> {
		// NOTE: For aws API, the s3.deleteObject seems to return exactly the same if the object existed or not. 
		//       Therefore, we need to do an additional ping to know if the file exist  or not to return true/false
		const exists = await this.exists(path);
		if (exists) {
			// NOTE: between the first test and this delete, the object might have been deleted, but since s3.deleteObjecct
			//       does not seems to tell if the object exits or not, this is the best can do.
			const command = new DeleteObjectCommand({ ...this.baseParams, ...{ Key: path } });
			await this.s3.send(command);
			return true;
		} else {
			process.stdout.write(` - Skipped (object not found)\n`);
			return false;
		}

	}
}





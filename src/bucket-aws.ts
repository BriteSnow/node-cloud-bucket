import { Bucket, BucketFile, buildFullDestPath, parsePrefixOrGlob, commonBucketDownload, commonBucketCopy, getContentType } from "./bucket-base";
import { readFile, createWriteStream, mkdirp } from 'fs-extra-plus';
import micromatch = require('micromatch');
import * as AWS from 'aws-sdk';

import { Readable, Writable, PassThrough } from "stream";
// import {Object as AwsFile} from 'aws-sdk';

type S3 = AWS.S3;
type AwsFile = AWS.S3.Object;



export interface AwsBucketCfg {
	bucketName: string;
	access_key_id: string;
	access_key_secret: string;
}

export async function getAwsBucket(cfg: AwsBucketCfg) {
	const credentials = new AWS.Credentials(cfg.access_key_id, cfg.access_key_secret);
	// Create S3 service object
	const s3 = new AWS.S3({ apiVersion: '2006-03-01', credentials });
	return new AwsBucket(s3, cfg.bucketName);
}



class AwsBucket implements Bucket<AwsFile> {
	private s3: S3;
	private baseParams: { Bucket: string };

	get type(): string {
		return 's3'
	}
	get name(): string {
		return this.baseParams.Bucket;
	}

	getPath(obj: AwsFile) {
		return obj.Key!; // TODO: need to investigate when Key is empty in S3. 
	}

	constructor(s3: S3, bucketName: string) {
		this.s3 = s3;
		this.baseParams = { Bucket: bucketName };
	}

	async getFile(path: string): Promise<BucketFile | null> {
		const object = await this.s3.headObject({ ...this.baseParams, ...{ Key: path } }).promise();
		if (object) {
			const updated = (object.LastModified) ? object.LastModified.toISOString() : undefined;
			return {
				bucket: this,
				path,
				updated,
				size: object.ContentLength,
				contentType: object.ContentType
			}
		} else {
			return null;
		}
	}

	/**
	 * 
	 * @param path prefix path or glob (the string before the first '*' will be used as prefix)
	 */
	async list(prefixOrGlob?: string): Promise<BucketFile[]> {
		const awsFiles = await this.listAwsFiles(prefixOrGlob);

		return awsFiles.map(gf => this.toFile(gf));
	}

	async copy(pathOrGlob: string, destDir: string | BucketFile): Promise<void> {
		const awsFiles = await this.listAwsFiles(pathOrGlob);

		const files = await commonBucketCopy(this, awsFiles, pathOrGlob, destDir,
			async (awsFile: AWS.S3.Object, dest: BucketFile) => {
				const destAwsBucket = (dest.bucket instanceof AwsBucket) ? dest.bucket as AwsBucket : null;
				if (!destAwsBucket) {
					throw new Error(`destBucket type ${dest.bucket.type} does not match source bucket type ${this.type}. For now, cross bucket type copy not supported.`)
				}
				const sourcePath = awsFile.Key!;
				const params = {
					CopySource: `${this.name}/${sourcePath}`,
					Bucket: destAwsBucket.name,
					Key: dest.path
				}
				await this.s3.copyObject(params).promise();
			}
		);
	}

	async download(pathOrGlob: string, localPath: string): Promise<BucketFile[]> {
		const awsFiles = await this.listAwsFiles(pathOrGlob);

		const files = await commonBucketDownload(this, awsFiles, pathOrGlob, localPath,
			async (object: AwsFile, localPath) => {
				const remotePath = object.Key!;
				const params = { ...this.baseParams, ...{ Key: remotePath } };
				const remoteReadStream = this.s3.getObject(params).createReadStream();
				const localWriteStream = createWriteStream(localPath);
				const writePromise = new Promise((resolve, reject) => {
					localWriteStream.once('close', () => {
						resolve();
					});
					localWriteStream.once('error', (ex) => {
						reject(ex);
					});
					remoteReadStream.pipe(localWriteStream);
				});

				await writePromise;

			});

		return files;
	}

	async downloadAsText(path: string): Promise<string> {
		const params = { ...this.baseParams, ...{ Key: path } };
		//const remoteReadStream = this.s3.getObject(params).createReadStream();
		const obj = await this.s3.getObject(params).promise();
		const content = obj.Body!.toString();
		return content;
	}

	async upload(localPath: string, destPath: string): Promise<BucketFile> {

		const fullDestPath = buildFullDestPath(localPath, destPath);

		process.stdout.write(`Uploading file ${localPath} to s3://${this.name}/${fullDestPath}`);

		try {
			const localFileData = await readFile(localPath);
			const ContentType = getContentType(destPath);
			const awsResult = await this.s3.putObject({ ...this.baseParams, ...{ Key: fullDestPath, Body: localFileData, ContentType } }).promise();
			process.stdout.write(` - DONE\n`);
			// FIXME: Needs to make sure we cannot get the object from the putObject result, and that the size can be assumed to be localFileData.length
			return { bucket: this, path: fullDestPath, size: localFileData.length };
		} catch (ex) {
			process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
			throw ex;
		}

	}

	async uploadContent(path: string, content: string): Promise<void> {
		const ContentType = getContentType(path);
		await this.s3.putObject({ ...this.baseParams, ...{ Key: path, Body: content, ContentType: ContentType } }).promise();
	}

	async createReadStream(path: string): Promise<Readable> {
		const params = { ...this.baseParams, ...{ Key: path } };
		const obj = this.s3.getObject(params);

		if (!obj) {
			throw new Error(`Object not found for ${path}`);
		}
		return obj.createReadStream();
	}

	async createWriteStream(path: string): Promise<Writable> {
		var pass = new PassThrough();

		const params = { ...this.baseParams, ...{ Key: path }, Body: pass };
		this.s3.upload(params);

		return pass;
	}

	async delete(path: string): Promise<boolean> {
		if (!path) {
			throw new Error(`AwsBucket - ERROR - Can't delete null or empty path`);
		}

		try {
			process.stdout.write(`Deleting s3://${this.baseParams.Bucket}/${path}`);
			await this.s3.deleteObject({ ...this.baseParams, ...{ Key: path } }).promise();
			process.stdout.write(` - DONE\n`);
			return true;
		} catch (ex) {
			process.stdout.write(` - FAILED - ABORT - Cause ${ex}\n`);
			throw ex;
		}

	}


	//#region    ---------- Private ---------- 


	/**
	 * List the googleFiles for this bucket;
	 */
	async listAwsFiles(prefixOrGlob?: string): Promise<AwsFile[]> {
		const { prefix, glob } = parsePrefixOrGlob(prefixOrGlob);

		// build the list params
		let listParams: { Prefix?: string } | undefined = undefined;
		if (prefix) {
			listParams = { Prefix: prefix };
		}
		const params = { ...this.baseParams, ...listParams };

		// perform the s3 list request
		try {
			const awsResult = await this.s3.listObjects(params).promise();
			const awsFiles = awsResult.Contents as AwsFile[];

			// if glob, filter again the result
			let files: AwsFile[] = (!glob) ? awsFiles : awsFiles.filter(af => micromatch.isMatch(af.Key!, glob));

			return files;
		} catch (ex) {
			throw ex;
		}

	}

	private toFile(awsFile: AwsFile): BucketFile {
		if (!awsFile) {
			throw new Error(`No awsFile`);
		}
		const updated = (awsFile.LastModified) ? awsFile.LastModified.toString() : undefined;
		// FIXME: Needs to handle when Key or Size is undefined.
		return {
			bucket: this,
			path: awsFile.Key!,
			size: awsFile.Size!,
			updated: updated
		}
	}

	//#endregion ---------- /Private ---------- 
}





import { S3, Credentials } from 'aws-sdk';
import { createWriteStream, readFile } from 'fs-extra-plus';
import { PassThrough, Readable, Writable } from "stream";
import { Bucket, BucketFile, buildFullDestPath, commonBucketDownload, getContentType, parsePrefixOrGlob, commonBucketCopy, commonDeleteAll, BucketFileDeleted, commonBucketUpload, BucketType } from "./bucket-base";
import micromatch = require('micromatch');

// import {Object as AwsFile} from 'aws-sdk';

// type S3 = AWS.S3;
type AwsFile = S3.Object;

export interface AwsBucketCfg {
	bucketName: string;
	access_key_id: string;
	access_key_secret: string;
}

export async function getAwsBucket(cfg: AwsBucketCfg) {
	const credentials = new Credentials(cfg.access_key_id, cfg.access_key_secret);
	// Create S3 service object
	const s3 = new S3({ apiVersion: '2006-03-01', credentials });
	return new AwsBucket(s3, cfg.bucketName);
}

class AwsBucket implements Bucket<AwsFile> {
	private s3: S3;
	private baseParams: { Bucket: string };

	get type(): BucketType {
		return 's3'
	}

	get name(): string {
		return this.baseParams.Bucket;
	}

	constructor(s3: S3, bucketName: string) {
		this.s3 = s3;
		this.baseParams = { Bucket: bucketName };
	}

	getPath(obj: AwsFile) {
		return obj.Key!; // TODO: need to investigate when Key is empty in S3. 
	}

	async exists(path: string): Promise<boolean> {
		const file = await this.getFile(path);
		return (file) ? true : false;
	}

	async getFile(path: string): Promise<BucketFile | null> {
		try {
			const object = await this.s3.headObject({ ...this.baseParams, ...{ Key: path } }).promise();
			const updated = (object.LastModified) ? object.LastModified.toISOString() : undefined;
			return {
				bucket: this,
				path,
				updated,
				size: object.ContentLength,
				contentType: object.ContentType
			}
		} catch (ex) {
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

	async upload(localFileOrDirOrGlob: string, destPath: string): Promise<BucketFile[]> {
		return commonBucketUpload(this, localFileOrDirOrGlob, destPath,
			async (localPath, fullDestPath, contentType) => {
				const localFileData = await readFile(localPath);
				const awsResult = await this.s3.putObject({ ...this.baseParams, ...{ Key: fullDestPath, Body: localFileData, ContentType: contentType } }).promise();
				return { bucket: this, path: fullDestPath, size: localFileData.length };
			});
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
			// NOTE: For aws API, the s3.deleteObject seems to return exactly the same if the object existed or not. 
			//       Therefore, we need to do an additional ping to know if the file exist  or not to return true/false
			const exists = await this.exists(path);
			if (exists) {
				// NOTE: between the first test and this delete, the object might have been deleted, but since s3.deleteObjecct
				//       does not seems to tell if the object exits or not, this is the best can do.
				await this.s3.deleteObject({ ...this.baseParams, ...{ Key: path } }).promise();
				process.stdout.write(` - DONE\n`);
				return true;
			} else {
				process.stdout.write(` - Skipped (object not found)\n`);
				return false;
			}
		} catch (ex) {
			process.stdout.write(` - FAILED - ABORT - Cause ${ex}\n`);
			throw ex;
		}
	}


	async deleteAll(files: BucketFile[]): Promise<BucketFileDeleted[]> {
		return await commonDeleteAll(this, files);
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
		const updated = (awsFile.LastModified) ? awsFile.LastModified.toISOString() : undefined;
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





import { Bucket, File, buildFullDestPath, extractPrefixAndGlob, downloadAll } from "./cloud-bucket-base";
import { readFile, createWriteStream, mkdirp } from 'fs-extra-plus';
import * as Path from 'path';
import micromatch = require('micromatch');
import * as AWS from 'aws-sdk';
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



class AwsBucket implements Bucket {
	private s3: S3;
	private baseParams: { Bucket: string };
	get type(): string {
		return 'gs'
	}
	get name(): string {
		return this.baseParams.Bucket;
	}


	constructor(s3: S3, bucketName: string) {
		this.s3 = s3;
		this.baseParams = { Bucket: bucketName };
	}

	async getFile(path: string): Promise<File | null> {
		throw new Error('Not implemented yet');
	}

	/**
	 * 
	 * @param path prefix path or glob (the string before the first '*' will be used as prefix)
	 */
	async list(prefixOrGlob?: string): Promise<File[]> {
		const awsFiles = await this.listAwsFiles(prefixOrGlob);

		return awsFiles.map(gf => this.toFile(gf));
	}

	async copy(pathOrGlob: string, destDir: string | File): Promise<void> {
		const files = await this.listAwsFiles(pathOrGlob);

		// get the dest bucket
		// FIXME: need to validate the File is GcpBucket
		const destBucket = ((typeof destDir === 'string') ? this : destDir.bucket) as AwsBucket;
		const destPathDir = (typeof destDir === 'string') ? destDir : destDir.path;

		// check if destPathDir is a dir (must end with `/`)
		if (!destPathDir.endsWith('/')) {
			throw new Error(`FATAL - CS ERROR - destDir must end with '/', but was '${destPathDir}')`)
		}

		for (let af of files) {
			const sourcePath = af.Key!;
			const basename = Path.basename(sourcePath);
			const destPath = destPathDir + basename;
			process.stdout.write(`Copying ${this.name}:${sourcePath} to ${destBucket.name}:${destPath}`);
			try {
				const params = {
					CopySource: `${this.name}/${sourcePath}`,
					Bucket: destBucket.name,
					Key: destPath
				}
				await this.s3.copyObject(params).promise();
				process.stdout.write(` - DONE\n`);
			} catch (ex) {
				process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
				throw ex;
			}
		}
	}

	async download(pathOrGlob: string, localDir: string): Promise<File[]> {
		const awsFiles = await this.listAwsFiles(pathOrGlob);

		const files = await downloadAll(this, awsFiles, pathOrGlob, localDir,
			(object: AWS.S3.Object) => { return object.Key! }
			, async (object: AWS.S3.Object, remotePath, localPath) => {
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

	async upload(localPath: string, destPath: string): Promise<File> {

		const fullDestPath = buildFullDestPath(localPath, destPath);

		process.stdout.write(`Uploading file ${localPath} to s3://${this.name}/${fullDestPath}`);

		try {
			const localFileData = await readFile(localPath);
			const awsResult = await this.s3.putObject({ ...this.baseParams, ...{ Key: fullDestPath, Body: localFileData } }).promise();
			process.stdout.write(` - DONE\n`);
			// FIXME: Needs to make sure we cannot get the object from the putObject result, and that the size can be assumed to be localFileData.length
			return { bucket: this, path: fullDestPath, size: localFileData.length };
		} catch (ex) {
			process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
			throw ex;
		}


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
		const { prefix, glob } = extractPrefixAndGlob(prefixOrGlob);

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

	private toFile(this: AwsBucket, awsFile: AwsFile): File {
		if (!awsFile) {
			throw new Error(`No awsFile`);
		}

		// FIXME: Needs to handle when Key or Size is undefined.

		return {
			bucket: this,
			path: awsFile.Key!,
			size: awsFile.Size!
		}

	}
	//#endregion ---------- /Private ---------- 
}





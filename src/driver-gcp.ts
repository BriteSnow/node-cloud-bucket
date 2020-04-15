import { Bucket as GoogleBucket, File as GoogleFile, GetFilesOptions, Storage as GoogleStorage } from '@google-cloud/storage';
import { Readable, Writable } from "stream";
import { Driver, ListCloudFilesOptions } from "./driver";
import { BucketFile, BucketType } from './types';
import micromatch = require('micromatch');

export async function getGsDriver(cfg: GsDriverCfg) {
	// TODO: valid cfg
	const googleStorageConf = {
		projectId: cfg.project_id,
		credentials: {
			client_email: cfg.client_email,
			private_key: cfg.private_key
		}
	}
	const storage = new GoogleStorage(googleStorageConf);
	const googleBucket = storage.bucket(cfg.bucketName);
	return new GcpDriver(googleBucket);
}

export interface GsDriverCfg {
	bucketName: string;
	project_id: string;
	client_email: string;
	private_key: string;
}

class GcpDriver implements Driver<GoogleFile> {
	readonly googleBucket: GoogleBucket;

	get type(): BucketType {
		return 'gs'
	}

	get name(): string {
		return this.googleBucket.name
	}

	constructor(googleBucket: GoogleBucket) {
		this.googleBucket = googleBucket;
	}

	toFile(googleFile: GoogleFile): Omit<BucketFile, 'bucket'> {
		if (!googleFile) {
			throw new Error(`No googleFile`);
		}
		const size = (googleFile.metadata.size) ? Number(googleFile.metadata.size) : undefined;
		return {
			path: googleFile.name,
			size,
			updated: googleFile.metadata.updated,
			contentType: googleFile.metadata.contentType
		}

	}

	getPath(obj: GoogleFile) {
		return obj.name;
	}

	async exists(path: string): Promise<boolean> {
		// Note: note gcp has specific file.exists method
		const result = await this.googleBucket.file(path).exists();
		return result[0];
	}

	async getCloudFile(path: string): Promise<GoogleFile | null> {
		const googleFile = this.googleBucket.file(path);
		try {
			return (await googleFile.get())[0];
		} catch (ex) {
			// not found return null, as per getFile design.
			if (ex.code === 404) {
				return null;
			}
			// otherwise, propagate exception 
			else {
				throw ex;
			}
		}
	}

	/**
	 * 
	 * @param path prefix path or glob (the string before the first '*' will be used as prefix)
	 */
	async listCloudFiles(opts: ListCloudFilesOptions): Promise<GoogleFile[]> {
		const { prefix, glob, delimiter } = opts;

		// build the query options and perform the re	quest
		let baseQuery: GetFilesOptions = { autoPaginate: true };
		if (delimiter === true) {
			baseQuery.delimiter = '/';
		}
		let getListOpts = (prefix) ? { ...baseQuery, prefix } : baseQuery;
		const result = await this.googleBucket.getFiles(getListOpts);
		let gfList = result[0] || [];


		// if glob, filter the data further
		let files: GoogleFile[] = (!glob) ? gfList : gfList.filter(gf => micromatch.isMatch(gf.name, glob));

		return files;
	}

	async downloadCloudFile(cf: GoogleFile, localPath: string): Promise<void> {
		await cf.download({ destination: localPath });
	}

	async uploadCloudFile(localFilePath: string, remoteFilePath: string, contentType?: string): Promise<GoogleFile> {
		const googleBucket = this.googleBucket;
		const googleFile = (await googleBucket.upload(localFilePath, { destination: remoteFilePath, contentType }))[0];
		return googleFile;
	}

	async copyCloudFile(cf: GoogleFile, dest: BucketFile): Promise<void> {
		if (dest.bucket.googleBucket == null) {
			throw new Error(`destBucket type ${dest.bucket.type} does not match source bucket type ${this.type}. For now, cross bucket type copy not supported.`)
		}
		const destGoogleBucket = dest.bucket.googleBucket;

		const destFile = destGoogleBucket.file(dest.path);
		await cf.copy(destFile);
	}

	async deleteCloudFile(path: string): Promise<boolean> {
		const googleFile = this.googleBucket.file(path);

		if (googleFile) {
			try {
				await googleFile.delete();
			} catch (ex) {
				// if not found, just return false.
				if (ex.code === 404) {
					process.stdout.write(` - Skipped (object not found)\n`);
					return false;
				} else {
					process.stdout.write(` - FAILED - ABORT - Cause ${ex}\n`);
					throw ex;
				}
			}

			// TODO: Probably needs to return true only if deleted. 
			return true;
		} else {
			return false;
		}
	}



	async downloadAsText(path: string): Promise<string> {
		const googleFile = this.googleBucket.file(path);
		const buffer = await googleFile.download();
		return buffer.toString();
	}


	async uploadCloudContent(path: string, content: string, contentType?: string): Promise<void> {
		const googleFile = this.googleBucket.file(path);
		const uploadReadable = new Readable();
		return new Promise(function (resolve, reject) {
			uploadReadable
				.pipe(googleFile.createWriteStream({ contentType }))
				.on('error', function (err: any) {
					reject(err);
				})
				.on('finish', function () {
					resolve();
				});
			uploadReadable.push(content);
			uploadReadable.push(null);
		});
	}
	async createReadStream(path: string): Promise<Readable> {
		const googleFile = this.googleBucket.file(path);
		return googleFile.createReadStream();
	}

	async createWriteStream(path: string): Promise<Writable> {
		const googleFile = this.googleBucket.file(path);
		return googleFile.createWriteStream();
	}





}





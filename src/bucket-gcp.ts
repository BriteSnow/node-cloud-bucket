import { Bucket as GoogleBucket, File as GoogleFile, Storage as GoogleStorage } from '@google-cloud/storage';
import { Readable, Writable } from "stream";
import { Bucket, BucketFile, buildFullDestPath, commonBucketCopy, commonBucketDownload, getContentType, parsePrefixOrGlob, commonDeleteAll, BucketFileDeleted, commonBucketUpload, BucketType } from "./bucket-base";
import micromatch = require('micromatch');

export async function getGcpBucket(cfg: GcpBucketCfg) {
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
	return new GcpBucket(googleBucket);
}

export interface GcpBucketCfg {
	bucketName: string;
	project_id: string;
	client_email: string;
	private_key: string;
}

class GcpBucket implements Bucket<GoogleFile> {
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

	getPath(obj: GoogleFile) {
		return obj.name;
	}

	async exists(path: string): Promise<boolean> {
		// Note: note gcp has specific file.exists method
		const result = await this.googleBucket.file(path).exists();
		return result[0];
	}

	async getFile(path: string): Promise<BucketFile | null> {
		const googleFile = this.googleBucket.file(path);
		try {
			const f = (await googleFile.get())[0];
			return this.toFile(f);
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
	async list(prefixOrGlob?: string): Promise<BucketFile[]> {
		const googleFiles = await this.listGoogleFiles(prefixOrGlob);

		return googleFiles.map(gf => this.toFile(gf));
	}

	async copy(pathOrGlob: string, destDir: string | BucketFile): Promise<void> {
		const gfiles = await this.listGoogleFiles(pathOrGlob);

		const files = await commonBucketCopy(this, gfiles, pathOrGlob, destDir,
			async (googleFile: GoogleFile, dest: BucketFile) => {
				const destGcpBucket = (dest.bucket instanceof GcpBucket) ? dest.bucket as GcpBucket : null;
				if (!destGcpBucket) {
					throw new Error(`destBucket type ${dest.bucket.type} does not match source bucket type ${this.type}. For now, cross bucket type copy not supported.`)
				}
				const destFile = destGcpBucket.googleBucket.file(dest.path);
				await googleFile.copy(destFile);
			}
		);

	}

	async download(pathOrGlob: string, localPath: string): Promise<BucketFile[]> {
		const googleFiles = await this.listGoogleFiles(pathOrGlob);

		const files = await commonBucketDownload(this, googleFiles, pathOrGlob, localPath,
			async (gf: GoogleFile, localPath) => {
				await gf.download({ destination: localPath });
			});

		return files;
	}

	async downloadAsText(path: string): Promise<string> {
		const googleFile = this.googleBucket.file(path);
		const buffer = await googleFile.download();
		return buffer.toString();
	}

	async upload(localFileOrDirOrGlob: string, destPath: string): Promise<BucketFile[]> {
		return commonBucketUpload(this, localFileOrDirOrGlob, destPath,
			async (localPath, remoteFilePath, contentType) => {
				const googleBucket = this.googleBucket;
				const googleFile = (await googleBucket.upload(localPath, { destination: remoteFilePath, contentType }))[0];
				return this.toFile(googleFile);
			});
	}

	async uploadOld(localPath: string, destPath: string): Promise<BucketFile> {
		const googleBucket = this.googleBucket;

		const fullDestPath = buildFullDestPath(localPath, destPath);
		const contentType = getContentType(destPath);

		// TODO: Needs to do 
		process.stdout.write(`Uploading file ${localPath} to gs://${this.name}/${fullDestPath}`);
		try {
			const googleFile = (await googleBucket.upload(localPath, { destination: fullDestPath, contentType }))[0];
			process.stdout.write(' - DONE\n');
			return this.toFile(googleFile);
		} catch (ex) {
			process.stdout.write(` - FAIL - ABORT - Cause: ${ex}`);
			throw ex;
		}

	}
	async uploadContent(path: string, content: string): Promise<void> {
		const googleFile = this.googleBucket.file(path);
		const uploadReadable = new Readable();
		const contentType = getContentType(path);
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


	async delete(path: string): Promise<boolean> {
		const googleFile = this.googleBucket.file(path);
		process.stdout.write(`Deleting gs://${this.name}/${path}`);

		if (googleFile) {
			try {
				await googleFile.delete();
				process.stdout.write(` - DONE\n`);
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

	async deleteAll(files: BucketFile[]): Promise<BucketFileDeleted[]> {
		return await commonDeleteAll(this, files);
	}

	//#region    ---------- Private ---------- 
	toFile(this: GcpBucket, googleFile: GoogleFile): BucketFile {
		if (!googleFile) {
			throw new Error(`No googleFile`);
		}
		const size = (googleFile.metadata.size) ? Number(googleFile.metadata.size) : undefined;
		return {
			path: googleFile.name,
			bucket: this,
			size,
			updated: googleFile.metadata.updated,
			contentType: googleFile.metadata.contentType
		}

	}

	/**
	 * List the googleFiles for this bucket;
	 */
	async listGoogleFiles(prefixOrGlob?: string): Promise<GoogleFile[]> {
		// extract the eventual prefix and glob from param
		const { prefix, glob } = parsePrefixOrGlob(prefixOrGlob);

		// build the query options and perform the request
		let baseQuery = { autoPaginate: true };
		let getListOpts = (prefix) ? { ...baseQuery, prefix } : baseQuery;
		const result = await this.googleBucket.getFiles(getListOpts);
		let gfList = result[0] || [];


		// if glob, filter the data further
		let files: GoogleFile[] = (!glob) ? gfList : gfList.filter(gf => micromatch.isMatch(gf.name, glob));

		return files;
	}
	//#endregion ---------- /Private ---------- 
}





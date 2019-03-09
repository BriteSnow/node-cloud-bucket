import { Bucket, File, buildFullDestPath, extractPrefixAndGlob, downloadAll } from "./cloud-bucket-base";
import { Storage as GoogleStorage, Bucket as GoogleBucket, File as GoogleFile } from '@google-cloud/storage';
import * as Path from 'path';
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

class GcpBucket implements Bucket {
	googleBucket: GoogleBucket;

	get type(): string {
		return 'gs'
	}

	get name(): string {
		return this.googleBucket.name
	}

	constructor(googleBucket: GoogleBucket) {
		this.googleBucket = googleBucket;
	}

	async getFile(path: string): Promise<File | null> {
		const googleFile = this.googleBucket.file(path);
		const f = (await googleFile.get())[0];
		return this.toFile(f);
	}

	/**
	 * 
	 * @param path prefix path or glob (the string before the first '*' will be used as prefix)
	 */
	async list(prefixOrGlob?: string): Promise<File[]> {
		const googleFiles = await this.listGoogleFiles(prefixOrGlob);

		return googleFiles.map(gf => this.toFile(gf));
	}

	async copy(pathOrGlob: string, destDir: string | File): Promise<void> {
		const files = await this.listGoogleFiles(pathOrGlob);

		// get the dest bucket
		// FIXME: need to validate the File is GcpBucket
		const destBucket = ((typeof destDir === 'string') ? this : destDir.bucket) as GcpBucket;
		const destPathDir = (typeof destDir === 'string') ? destDir : destDir.path;

		// check if destPathDir is a dir (must end with `/`)
		if (!destPathDir.endsWith('/')) {
			throw new Error(`FATAL - CS ERROR - destDir must end with '/', but was '${destPathDir}')`)
		}


		for (let gf of files) {
			const basename = Path.basename(gf.name);
			const destPath = destPathDir + basename;
			const destFile = this.googleBucket.file(destPath);
			process.stdout.write(`Copying ${this.googleBucket.name}:${gf.name} to ${destBucket.googleBucket.name}:${destPath}`);
			try {
				await gf.copy(destFile);
				process.stdout.write(` - DONE\n`);
			} catch (ex) {
				process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
				throw ex;
			}
		}
	}

	async download(pathOrGlob: string, localDir: string): Promise<File[]> {
		const googleFiles = await this.listGoogleFiles(pathOrGlob);

		const files = await downloadAll(this, googleFiles, pathOrGlob, localDir,
			(object: GoogleFile) => { return object.name },
			async (gf: GoogleFile, remotePath, localPath) => {
				await gf.download({ destination: localPath });
			});

		return files;
	}

	async upload(localPath: string, destPath: string): Promise<File> {
		const googleBucket = this.googleBucket;

		const fullDestPath = buildFullDestPath(localPath, destPath);

		// TODO: Needs to do 
		process.stdout.write(`Uploading file ${localPath} to gs://${this.name}/${fullDestPath}`);
		try {
			const googleFile = (await googleBucket.upload(localPath, { destination: fullDestPath }))[0];
			process.stdout.write(' - DONE\n');
			return this.toFile(googleFile);
		} catch (ex) {
			process.stdout.write(' - FAIL - ABORT - Cause: ${ex}');
			throw ex;
		}

	}

	async delete(path: string): Promise<boolean> {
		const googleFile = this.googleBucket.file(path);
		process.stdout.write(`Deleting gs://${this.googleBucket.name}/${path}`);

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


	//#region    ---------- Private ---------- 
	toFile(this: GcpBucket, googleFile: GoogleFile): File {
		if (!googleFile) {
			throw new Error(`No googleFile`);
		}

		return {
			path: googleFile.name,
			bucket: this,
			size: googleFile.metadata.size
		}

	}

	/**
	 * List the googleFiles for this bucket;
	 */
	async listGoogleFiles(prefixOrGlob?: string): Promise<GoogleFile[]> {
		// extract the eventual prefix and glob from param
		const { prefix, glob } = extractPrefixAndGlob(prefixOrGlob);

		// build the query options and perform the request
		let getListOpts = (prefix) ? { prefix } : undefined;
		const result = await this.googleBucket.getFiles(getListOpts);
		let gfList = result[0] || [];


		// if glob, filter the data further
		let files: GoogleFile[] = (!glob) ? gfList : gfList.filter(gf => micromatch.isMatch(gf.name, glob));

		return files;
	}
	//#endregion ---------- /Private ---------- 
}





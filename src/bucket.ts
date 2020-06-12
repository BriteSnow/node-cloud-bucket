import { Bucket as GoogleBucket } from '@google-cloud/storage';
import { S3 } from 'aws-sdk';
import { glob, mkdirp } from 'fs-extra-plus';
import { lookup } from 'mime-types';
import * as Path from 'path';
import { Readable, Writable } from 'stream';
import { Driver, ListCloudFilesOptions } from './driver';
import { BucketFile, BucketFileDeleted, BucketType, ListArg, ListOptions, ListResult } from './types';

export interface BucketOptions {
	driver: Driver;
	log: boolean;
}

export function newBucket(opts: BucketOptions) {
	return new BucketImpl(opts);
}

export interface Bucket {
	type: BucketType;
	name: string;

	readonly s3?: S3;
	readonly googleBucket?: GoogleBucket;


	exists(path: string): Promise<boolean>;

	/** 
	 * Get and return a BucketFile for a given path (will do a cloud bucket query).
	 * Returns null if not found. Throw exception if any other exception than notfound.  
	 */
	getFile(path: String): Promise<BucketFile | null>;

	list(optsOrPrefix?: ListArg): Promise<ListResult>;

	listFiles(optsOrPrefix?: ListArg): Promise<BucketFile[]>;

	/**
	 * Will copy one or more file to a destination file (then require single match, i.e. no glob), 
	 * or to a destination folder.
	 * @param prefixOrGlob full file name, or prefix or glob. If multiple match, to need dest must be a dir (end with '/')
	 * @param dest can be dir path  (copying multiple file and preserving filename and relative dir structure), or full file name (require single match)
	 */
	copy(prefixOrGlob: string, dest: string | BucketFile): Promise<void>;

	/**
	 * Download one or more remote bucket file to a local file or a folder structure.
	 * @param prefixOrGlob 
	 * @param localDir 
	 *  If end with '/' then all files from the prefixOrGlob will be downloaded with their originial filename (and relative folder structure). 
	 *  Otherwise, if full file name, then, make sure there is onyl one matching bucket source, and copy to this file destination (to rename on download)
	 */
	download(prefixOrGlob: string, localPath: string): Promise<BucketFile[]>

	downloadAsText(path: string): Promise<string>

	upload(localPath: string, path: string): Promise<BucketFile[]>;

	uploadContent(path: string, content: string): Promise<void>;

	createReadStream(path: string): Promise<Readable>;

	createWriteStream(path: string): Promise<Writable>;

	/**
	 * Delete a single file.
	 * @param path 
	 */
	delete(path: string): Promise<boolean>

	deleteAll(files: BucketFile[]): Promise<BucketFileDeleted[]>

}


class BucketImpl<F> implements Bucket {
	driver: Driver<F>;
	log: boolean;

	constructor(opts: BucketOptions) {
		this.driver = opts.driver;
		this.log = opts.log;
	}

	get type() {
		return this.driver.type;
	}
	get name() {
		return this.driver.name;
	}

	get s3(): S3 | undefined {
		if (this.driver.type === 's3') {
			return (<any>this.driver).s3 as S3;
		}
	}

	get googleBucket(): GoogleBucket | undefined {
		if (this.driver.type === 'gs') {
			return (<any>this.driver).googleBucket as GoogleBucket;
		}
	}

	toFile(cf: F): BucketFile {
		const bucketFile = this.driver.toFile(cf);
		(<BucketFile>bucketFile).bucket = this; // driver does not know/add bucket property
		return bucketFile as BucketFile;
	}


	async exists(path: string): Promise<boolean> {
		return this.driver.exists(path);
	}


	/** 
	 * Get and return a BucketFile for a given path (will do a cloud bucket query).
	 * Returns null if not found. Throw exception if any other exception than notfound.  
	 */
	async getFile(path: String): Promise<BucketFile | null> {
		const cloudFile = await this.driver.getCloudFile(path);
		return (cloudFile == null) ? null : this.toFile(cloudFile);
	}

	async listFiles(optsOrPrefix?: ListArg): Promise<BucketFile[]> {
		return (await this.list(optsOrPrefix)).files;
	}

	async list(optsOrPrefix?: ListArg): Promise<ListResult> {
		const cloudFilesOptions = parseListOptions(optsOrPrefix);
		const cloudFilesResult = await this.driver.listCloudFiles(cloudFilesOptions);
		const { dirs, nextMarker } = cloudFilesResult;
		const files = cloudFilesResult.files.map(cf => this.toFile(cf));
		return { files, dirs, nextMarker };
	}



	/**
	 * Will copy one or more file to a destination file (then require single match, i.e. no glob), 
	 * or to a destination folder.
	 * @param prefixOrGlob full file name, or prefix or glob. If multiple match, to need dest must be a dir (end with '/')
	 * @param dest can be dir path  (copying multiple file and preserving filename and relative dir structure), or full file name (require single match)
	 */
	async copy(prefixOrGlob: string, dest: string | BucketFile): Promise<void> {
		// return this.driver.copy(prefixOrGlob, dest);
		const cloudFiles = (await this.driver.listCloudFiles(parseListOptions(prefixOrGlob))).files;

		const destBucket = (typeof dest === 'string') ? this : dest.bucket;
		const destPath = (typeof dest === 'string') ? dest : dest.path;

		const isDestPathDir = destPath.endsWith('/');

		// If not a local directory, make sure we have only one file.
		// TODO: might check if the pathOrGlob is a glob as well to prevent it (in case there is only one match)
		if (!isDestPathDir && cloudFiles.length > 1) {
			throw new Error(`Cannot copy multiple files ${prefixOrGlob} to the same bucket file ${destPath}. Download to a directory (end with '/') to download multipel file.`);
		}

		const { baseDir } = parsePrefixOrGlob(prefixOrGlob);
		const files: BucketFile[] = [];

		for (let cf of cloudFiles) {
			const remotePath = this.driver.getPath(cf);
			const destFilePath = (isDestPathDir) ? getDestPath(baseDir, remotePath, destPath) : destPath;

			if (this.log) {
				process.stdout.write(`Copying ${this.type}://${this.name}/${remotePath} to ${destBucket.type}://${destBucket.name}/${destFilePath}`);
			}

			try {
				await this.driver.copyCloudFile(cf, { bucket: destBucket, path: destFilePath });
				if (this.log) {
					process.stdout.write(` - DONE\n`);
				}

			} catch (ex) {
				if (this.log) {
					process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
				}
				throw ex;
			}
		}
		// return files;
	}

	/**
	 * Download one or more remote bucket file to a local file or a folder structure.
	 * @param prefixOrGlob 
	 * @param localDir 
	 *  If end with '/' then all files from the prefixOrGlob will be downloaded with their originial filename (and relative folder structure). 
	 *  Otherwise, if full file name, then, make sure there is onyl one matching bucket source, and copy to this file destination (to rename on download)
	 */
	async download(prefixOrGlob: string, localPath: string): Promise<BucketFile[]> {
		const isLocalPathDir = localPath.endsWith('/');

		const cloudFiles = (await this.driver.listCloudFiles(parseListOptions(prefixOrGlob))).files;

		// If not a local directory, make sure we have only one file.
		// TODO: might check if the pathOrGlob is a glob as well to prevent it (in case there is only one match)
		if (!isLocalPathDir && cloudFiles.length > 1) {
			throw new Error(`Cannot copy multiple files ${prefixOrGlob} to the same local file ${localPath}. Download to a directory (end with '/') to download multipel file.`);
		}
		const files: BucketFile[] = [];
		const { baseDir } = parsePrefixOrGlob(prefixOrGlob);

		for (let cf of cloudFiles) {
			const remotePath = this.driver.getPath(cf);

			const localFilePath = (isLocalPathDir) ? getDestPath(baseDir, remotePath, localPath) : localPath;

			const localPathDir = Path.dirname(localFilePath);
			await mkdirp(localPathDir);
			if (this.log) {
				process.stdout.write(`Downloading ${this.type}://${this.name}/${remotePath} to ${localFilePath}`);
			}

			try {
				await this.driver.downloadCloudFile(cf, localFilePath);
				if (this.log) {
					process.stdout.write(` - DONE\n`);
				}
				const file = { bucket: this, path: remotePath, size: -1, local: localFilePath };
				files.push(file);
			} catch (ex) {
				if (this.log) {
					process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
				}
				throw ex;
			}
		}

		return files;
	}

	downloadAsText(path: string): Promise<string> {
		return this.driver.downloadAsText(path);
	}

	async upload(localPath: string, remotePath: string): Promise<BucketFile[]> {
		const bucketFiles: BucketFile[] = [];

		if (localPath.endsWith('/')) {
			localPath = localPath + '**/*.*';
		}
		const isLocalGlob = localPath.includes('*');

		const { baseDir } = parsePrefixOrGlob(localPath);

		const localFiles = await glob(localPath);

		for (const localPath of localFiles) {
			// if we have an localFileExpression (globs), then, we build the fullDestPath relative to the baseDir of the glob (last / before the first *)
			const fullDestPath = (isLocalGlob) ? getDestPath(baseDir, localPath, remotePath) : buildFullDestPath(localPath, remotePath);
			const contentType = getContentType(localPath);

			if (this.log) {
				process.stdout.write(`Uploading file ${localPath} to ${this.type}://${this.name}/${fullDestPath}`);
			}

			try {
				const cloudFile = await this.driver.uploadCloudFile(localPath, fullDestPath, contentType);
				const bucketFile = this.toFile(cloudFile);
				bucketFiles.push(bucketFile);
				if (this.log) {
					process.stdout.write(` - DONE\n`);
				}
			} catch (ex) {
				if (this.log) {
					process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
				}

				throw ex;
			}
		}


		return bucketFiles;
	}

	uploadContent(path: string, content: string): Promise<void> {
		const contentType = getContentType(path);
		return this.driver.uploadCloudContent(path, content, contentType);
	}

	createReadStream(path: string): Promise<Readable> {
		return this.driver.createReadStream(path);
	}

	createWriteStream(path: string): Promise<Writable> {
		const contentType = getContentType(path);
		return this.driver.createWriteStream(path, contentType);
	}

	/**
	 * Delete a single file.
	 * @param path 
	 */
	async delete(path: string): Promise<boolean> {
		let deleted = false;
		if (!path) {
			throw new Error(`ERROR - Can't delete null or empty path`);
		}
		try {
			if (this.log) {
				process.stdout.write(`Deleting ${this.type}://${this.name}/${path}`);
			}

			deleted = await this.driver.deleteCloudFile(path);

			if (this.log) {
				process.stdout.write(` - DONE\n`);
			}

		} catch (ex) {
			throw new Error(`ERROR - cloud-bucket - Cannot delete ${path} for bucket ${this.name}. Cause: ${ex}`);
		}
		return deleted;
	}

	async deleteAll(files: BucketFile[]): Promise<BucketFileDeleted[]> {
		const filesInfo: BucketFileDeleted[] = [];

		// validate that all files are same bucket
		for (const file of files) {
			// check if same bucket
			if (file.bucket !== this) {
				throw new Error(`Cannot delete file from another bucket ${this.name} should match file bucket ${file.bucket.name}`);
			}
		}

		for (const file of files) {
			const deleted = await this.driver.deleteCloudFile(file.path);
			filesInfo.push({ ...file, deleted })
		}

		return filesInfo;
	}

}


//#region    ---------- Utils ---------- 
function getDestPath(baseDir: string | undefined, remotePath: string, destPathDir: string) {
	const baseName = Path.basename(remotePath);
	const filePath = (baseDir) ? Path.relative(baseDir, remotePath) : baseName;
	const destPath = `${destPathDir}${filePath}`;
	return destPath;
}

/**
 * Build the full destination path from the local path name and the destPath
 * - If `destPath` ends with `/`, then baseName of `localPath` is concatenated. 
 * - Otherwise, `destPath` is the fullDestPath. 
 * 
 * @throws exception if destPath is not present. 
 */
export function buildFullDestPath(localPath: string, destPath: string) {

	// we do not have a dest path, throw error
	if (!destPath) {
		throw new Error('No depthPath');
	}

	let fullDestPath: string;

	// if it is a folder, we just concatinate the base name
	if (destPath.endsWith('/')) {
		const srcBaseName = Path.basename(localPath);
		fullDestPath = destPath + srcBaseName;
	}
	// if the destPath is not a folder, assume it is the new file name.
	else {
		fullDestPath = destPath;
	}

	return fullDestPath;
}


export function getContentType(path: string) {
	let ct = lookup(path);
	let contentType = (ct) ? ct : undefined;
	return contentType;

}


export function parseListOptions(optsOrPrefix?: ListOptions | string): ListCloudFilesOptions {
	if (optsOrPrefix == null) {
		optsOrPrefix = ''; // for now, default
	}
	const opts = (typeof optsOrPrefix === 'string') ? { prefix: optsOrPrefix } : optsOrPrefix;

	const { prefix, glob } = parsePrefixOrGlob(opts.prefix);
	const { directory, limit, marker } = opts;
	return { prefix, glob, directory, limit, marker };
}
/**
 * Return a clean prefix and glob when defined in the string. Clean prefix, meaning, glob less one, 
 * that can be passed to most cloud storage api. 
 * 
 * @param prefixOrGlob undefined, null, e.g., 'some-prefix', 'folder/', 'folder/glob-pattern.*'
 * @returns {prefix, glob, baseDir} 
 * 					- prefix is the first characters until the first glob character ('*')
 * 					- glob is prefixOrGlob value if it is a glob, otherwise undefined.
 * 					- baseDir is the eventual longest directory path without any glob char (ending with '/') 
 */
export function parsePrefixOrGlob(prefixOrGlob?: string) {
	let glob: string | undefined;
	let prefix: string | undefined;
	let baseDir: string | undefined;

	if (prefixOrGlob && prefixOrGlob.length > 0) {
		const firstWildIdx = prefixOrGlob.indexOf('*');
		// if it has a '*' then it is a pattern
		if (firstWildIdx > 0) {
			glob = prefixOrGlob;
			prefix = prefixOrGlob.substring(0, firstWildIdx);
		}
		// otherwise, it is just a 
		else {
			prefix = prefixOrGlob;
		}
	}

	if (prefix) {
		const lastSlashIdx = prefix.lastIndexOf('/');
		if (lastSlashIdx > -1) {
			baseDir = prefix.substring(0, lastSlashIdx + 1);
		}
	}

	return { prefix, glob, baseDir };
}
//#endregion ---------- /Utils ----------
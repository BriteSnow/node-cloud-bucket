import { glob, mkdirp } from 'fs-extra-plus';
import * as mime from 'mime-types';
import * as Path from 'path';
import { Readable, Writable } from 'stream';

export interface BucketFile {
	bucket: Bucket;
	path: string;
	size?: number;
	updated?: string;
	contentType?: string;
	local?: string; // optional local file path
}

export type BucketType = 's3' | 'gs';

export type BucketFileDeleted = BucketFile & { deleted: boolean };

// Note: right now use generic default with F (file) any
export interface Bucket<F = any> {
	type: BucketType;
	name: string;

	/** Return the path of a cloud "file object" */
	getPath(obj: F): string;

	exists(path: string): Promise<boolean>;

	/** 
	 * Get and return a BucketFile for a given path (will do a cloud bucket query).
	 * Returns null if not found. Throw exception if any other exception than notfound.  
	 */
	getFile(path: String): Promise<BucketFile | null>;

	list(optsOrPrefix?: ListArg): Promise<BucketFile[]>;

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

/** Interface used for the bucket.list */
export interface ListOptions {
	prefix?: string; // the prefix or glob
	delimiter?: boolean; // if true, the '/' delimiter will be set (might allow to set specific char later)
}

/** Argument type for listing a set of bucket item for .list and .download
 * - when string means it is the prefix (which can be of glob format)
 * - when ListOptions prefix can be specified as property.
 */
type ListArg = ListOptions | string;

/** Internal Interface to the list implementation */
export interface InternalListOptions {
	prefix?: string; // the prefix (only)
	glob?: string; // the eventual glob
	delimiter?: boolean; // if true, the '/' delimiter will be set (might allow to set specific char later)
}

//#region    ---------- Common Bucket Utils ---------- 
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

export function parseListOptions(optsOrPrefix?: ListOptions | string): InternalListOptions {
	const { prefix, glob } = (typeof optsOrPrefix === 'string') ? parsePrefixOrGlob(optsOrPrefix) : parsePrefixOrGlob(optsOrPrefix?.prefix);
	return { prefix, glob, delimiter: (typeof optsOrPrefix !== 'string') ? optsOrPrefix?.delimiter : undefined }
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

//// Common DOWNLOAD

type ItemDownloadFn<F> = (object: F, localPath: string) => Promise<void>;

export async function commonBucketDownload<F>(bucket: Bucket, cloudFiles: F[],
	pathOrGlob: string, localPath: string,
	downloadr: ItemDownloadFn<F>): Promise<BucketFile[]> {

	const isLocalPathDir = localPath.endsWith('/');

	// If not a local directory, make sure we have only one file.
	// TODO: might check if the pathOrGlob is a glob as well to prevent it (in case there is only one match)
	if (!isLocalPathDir && cloudFiles.length > 1) {
		throw new Error(`Cannot copy multiple files ${pathOrGlob} to the same local file ${localPath}. Download to a directory (end with '/') to download multipel file.`);
	}
	const files: BucketFile[] = [];
	const { baseDir } = parsePrefixOrGlob(pathOrGlob);

	for (let cf of cloudFiles) {
		const remotePath = bucket.getPath(cf);

		const localFilePath = (isLocalPathDir) ? getDestPath(baseDir, remotePath, localPath) : localPath;

		const localPathDir = Path.dirname(localFilePath);
		await mkdirp(localPathDir);
		process.stdout.write(`Downloading ${bucket.type}://${bucket.name}/${remotePath} to ${localFilePath}`);

		try {
			await downloadr(cf, localFilePath);
			process.stdout.write(` - DONE\n`);
			const file = { bucket, path: remotePath, size: -1, local: localFilePath };
			files.push(file);
		} catch (ex) {
			process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
			throw ex;
		}
	}

	return files;
}

//// COMMON UPLOAD
type ItemUploadFn = (localFilePath: string, remoteFilePath: string, contentType?: string) => Promise<BucketFile>;

export async function commonBucketUpload<F>(bucket: Bucket, localFileOrDirOrGlob: string,
	remotePath: string,
	uploadr: ItemUploadFn): Promise<BucketFile[]> {

	const bucketFiles: BucketFile[] = [];

	if (localFileOrDirOrGlob.endsWith('/')) {
		localFileOrDirOrGlob = localFileOrDirOrGlob + '**/*.*';
	}
	const isLocalGlob = localFileOrDirOrGlob.includes('*');

	const { baseDir } = parsePrefixOrGlob(localFileOrDirOrGlob);

	const localFiles = await glob(localFileOrDirOrGlob);

	for (const localPath of localFiles) {
		// if we have an localFileExpression (globs), then, we build the fullDestPath relative to the baseDir of the glob (last / before the first *)
		const fullDestPath = (isLocalGlob) ? getDestPath(baseDir, localPath, remotePath) : buildFullDestPath(localPath, remotePath);
		const contentType = getContentType(fullDestPath);
		process.stdout.write(`Uploading file ${localPath} to ${bucket.type}://${bucket.name}/${fullDestPath}`);
		try {
			const bucketFile = await uploadr(localPath, fullDestPath, contentType);
			bucketFiles.push(bucketFile);
			process.stdout.write(` - DONE\n`);
		} catch (ex) {
			process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
			throw ex;
		}
	}


	return bucketFiles;
}

//// COMMON COPY

type ItemCopyFn<F> = (Object: F, destDir: BucketFile) => Promise<void>;

export async function commonBucketCopy<F>(bucket: Bucket, cloudFiles: F[], pathOrGlob: string, dest: string | BucketFile,
	copier: ItemCopyFn<F>) {
	const destBucket = ((typeof dest === 'string') ? bucket : dest.bucket);
	const destPath = (typeof dest === 'string') ? dest : dest.path;

	const isDestPathDir = destPath.endsWith('/');

	// If not a local directory, make sure we have only one file.
	// TODO: might check if the pathOrGlob is a glob as well to prevent it (in case there is only one match)
	if (!isDestPathDir && cloudFiles.length > 1) {
		throw new Error(`Cannot copy multiple files ${pathOrGlob} to the same bucket file ${destPath}. Download to a directory (end with '/') to download multipel file.`);
	}

	const { baseDir } = parsePrefixOrGlob(pathOrGlob);
	const files: BucketFile[] = [];

	for (let cf of cloudFiles) {
		const remotePath = bucket.getPath(cf);
		const destFilePath = (isDestPathDir) ? getDestPath(baseDir, remotePath, destPath) : destPath;

		process.stdout.write(`Copying ${bucket.type}://${bucket.name}/${remotePath} to ${bucket.type}://${destBucket.name}/${destFilePath}`);

		try {
			await copier(cf, { bucket: destBucket, path: destFilePath });
			process.stdout.write(` - DONE\n`);

		} catch (ex) {
			process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
			throw ex;
		}
	}
	return files;
}

export async function commonDeleteAll(bucket: Bucket, files: BucketFile[]): Promise<BucketFileDeleted[]> {
	const filesInfo: BucketFileDeleted[] = [];

	// validate that all files are same bucket
	for (const file of files) {
		// check if same bucket
		if (file.bucket !== bucket) {
			throw new Error(`Cannot delete file from another bucket ${bucket.name} should match file bucket ${file.bucket.name}`);
		}
	}

	for (const file of files) {
		const deleted = await bucket.delete(file.path);
		filesInfo.push({ ...file, deleted })
	}

	return filesInfo;
}
//#endregion ---------- /Common Bucket Utils ---------- 

function getDestPath(baseDir: string | undefined, remotePath: string, destPathDir: string) {
	const baseName = Path.basename(remotePath);
	const filePath = (baseDir) ? Path.relative(baseDir, remotePath) : baseName;
	const destPath = `${destPathDir}${filePath}`;
	return destPath;
}

export function getContentType(path: string) {
	let ct = mime.lookup(path);
	let contentType = (ct) ? ct : undefined;
	return contentType;

}


/**
 * NOT IMPLEMENTED YET
 * Can be set in bucket constructor, or overrided per call. 
 */
interface Options {
	log: boolean | string; // (default true) true to log, string to log with a prefix 
	skipOnFatal: boolean | Function;
	beforeAction: Function;
	afterAction: Function;
}

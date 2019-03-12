import * as Path from 'path';
import { mkdirp } from 'fs-extra-plus';
import { Readable, Writable } from 'stream';
import * as mime from 'mime-types';

export interface BucketFile {
	bucket: Bucket;
	path: string;
	size?: number;
	updated?: string;
	contentType?: string;
	local?: string; // optional local file path
}




// Note: right now use generic default with F (file) any
export interface Bucket<F = any> {
	type: string;
	name: string;

	/** Return the path of a cloud "file object" */
	getPath(obj: F): string;

	/** Get and return a BucketFile for a given path (will do a cloud bucket query) */
	getFile(path: String): Promise<BucketFile | null>;

	list(prefixOrGlob?: String): Promise<BucketFile[]>;

	copy(pathOrGlob: string, to: string | BucketFile): Promise<void>;

	/**
	 * Download one or more remote bucket file to a local file or a folder structure.
	 * @param prefixOrGlob 
	 * @param localDir 
	 *  If end with '/' then all files from the prefixOrGlob will be downloaded with their originial filename (and relative folder structure). 
	 *  Otherwise, if full file name, then, make sure there is onyl one matching bucket source, and copy to this file destination (to rename on download)
	 */
	download(prefixOrGlob: string, localPath: string): Promise<BucketFile[]>

	downloadAsText(path: string): Promise<string>

	upload(localPath: string, path: string): Promise<BucketFile>;

	uploadContent(path: string, content: string): Promise<void>;

	createReadStream(path: string): Promise<Readable>;

	createWriteStream(path: string): Promise<Writable>;

	delete(path: string): Promise<boolean>

}


//#region    ---------- Common Bucket Utils ---------- 
/**
 * Build the full destination path from the local path name and the destPath
 * - If `destPath` ends with `/`, then baseName of `localPath` is concatenated. 
 * - Otherwise, `destPath` is the fulLDestPath. 
 * 
 * @throws exception if destPath is not present. 
 */
export function buildFullDestPath(localPath: string, destPath: string) {

	// we we do not have a dest path, throw error
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

/**
 * Return a clean prefix and glob when defined in the string. Clean prefix, meaning, glob less one, 
 * that can be passed to most cloud storage api. 
 * 
 * @param prefixOrGlob undefined, null, e.g., 'some-prefix', 'folder/', 'folder/glob-pattern.*'
 * @returns {prefix, glob, baseDir} 
 * 					- prefix is the first characters unitl the first glob character ('*')
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
//#endregion ---------- /Common Bucket Utils ---------- 

function getDestPath(baseDir: string | undefined, remotePath: string, destPathDir: string) {
	const baseName = Path.basename(remotePath);
	const filePath = (baseDir) ? Path.relative(baseDir, remotePath) : baseName;
	const destPath = `${destPathDir}${filePath}`;
	return destPath;
}

export function getContentType(path: string) {
	let ct = mime.contentType(path);
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

import * as Path from 'path';
import { mkdirp } from 'fs-extra-plus';

export interface BucketFile {
	bucket: Bucket;
	path: string;
	size?: number;
	local?: string; // optional local file path
}



// Note: right now use generic default with F (file) any
export interface Bucket<F = any> {
	type: string;
	name: string;

	getPath(obj: F): string;

	getFile(path: String): Promise<BucketFile | null>;

	list(prefixOrGlob?: String): Promise<BucketFile[]>;

	copy(path: string, to: string | BucketFile): Promise<void>;

	download(prefixOrGlob: string, localDir: string): Promise<BucketFile[]>

	upload(localPath: string, path: string): Promise<BucketFile>

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
export function extractPrefixAndGlob(prefixOrGlob?: string) {
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
	pathOrGlob: string, localDir: string,
	downloadr: ItemDownloadFn<F>): Promise<BucketFile[]> {

	const files: BucketFile[] = [];
	const { baseDir } = extractPrefixAndGlob(pathOrGlob);

	for (let cf of cloudFiles) {
		const remotePath = bucket.getPath(cf);

		const localPath = getDestPath(baseDir, remotePath, localDir);

		const localPathDir = Path.dirname(localPath);
		await mkdirp(localPathDir);
		process.stdout.write(`Downloading ${bucket.type}://${bucket.name}/${remotePath} to ${localPath}`);

		try {
			await downloadr(cf, localPath);
			process.stdout.write(` - DONE\n`);
			const file = { bucket, path: remotePath, size: -1, local: localPath };
			files.push(file);
		} catch (ex) {
			process.stdout.write(` - FAIL - ABORT - Cause: ${ex}\n`);
			throw ex;
		}
	}

	return files;
}

type ItemCopyFn<F> = (Object: F, destDir: BucketFile) => Promise<void>;

export async function commonBucketCopy<F>(bucket: Bucket, cloudFiles: F[], pathOrGlob: string, destDir: string | BucketFile,
	copier: ItemCopyFn<F>) {
	const destBucket = ((typeof destDir === 'string') ? bucket : destDir.bucket);
	const destPathDir = (typeof destDir === 'string') ? destDir : destDir.path;

	// check if destPathDir is a dir (must end with `/`)
	if (!destPathDir.endsWith('/')) {
		throw new Error(`FATAL - CS ERROR - destDir must end with '/', but was '${destPathDir}')`)
	}

	const { baseDir } = extractPrefixAndGlob(pathOrGlob);
	const files: BucketFile[] = [];

	for (let cf of cloudFiles) {
		const remotePath = bucket.getPath(cf);
		const destPath = getDestPath(baseDir, remotePath, destPathDir);

		process.stdout.write(`Copying ${bucket.type}://${bucket.name}/${remotePath} to ${bucket.type}://${destBucket.name}/${destPath}`);

		try {
			await copier(cf, { bucket: destBucket, path: destPath });
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


////// Thoughts

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

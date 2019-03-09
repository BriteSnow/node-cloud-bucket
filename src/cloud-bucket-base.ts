import * as Path from 'path';
import { mkdirp } from 'fs-extra-plus';

export interface File {
	bucket: Bucket;
	path: string;
	size: number;
	local?: string; // optional local file path
}




export interface Bucket {
	type: string;
	name: string;

	getFile(path: String): Promise<File | null>;

	list(prefixOrGlob?: String): Promise<File[]>;

	copy(path: string, to: string | File): Promise<void>;

	download(prefixOrGlob: string, localDir: string): Promise<File[]>

	upload(localPath: string, path: string): Promise<File>

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


type ItemDownloadFn<T> = (object: T, remotePath: string, localPath: string) => Promise<void>;
type GetRemotePath<T> = (object: T) => string;

export async function downloadAll<T>(bucket: Bucket, cloudFiles: T[],
	pathOrGlob: string, localDir: string,
	getRemotePathFn: GetRemotePath<T>,
	downloadr: ItemDownloadFn<T>): Promise<File[]> {

	const files: File[] = [];
	const { baseDir } = extractPrefixAndGlob(pathOrGlob);

	for (let cf of cloudFiles) {
		const remotePath = getRemotePathFn(cf);

		const baseName = Path.basename(remotePath);
		const filePath = (baseDir) ? Path.relative(baseDir, remotePath) : baseName;
		const localPath = `${localDir}${filePath}`;
		const localPathDir = Path.dirname(localPath);
		await mkdirp(localPathDir);
		process.stdout.write(`Downloading s3://${bucket.name}/${remotePath} to ${localPath}`);

		try {
			await downloadr(cf, remotePath, localPath);
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
//#endregion ---------- /Common Bucket Utils ---------- 



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

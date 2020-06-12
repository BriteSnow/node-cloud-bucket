import { Readable, Writable } from 'stream';
import { BucketFile, BucketType } from './types';



// Note: right now use generic default with F (file) any
export interface Driver<F = any> {
	type: BucketType;
	name: string;

	toFile(orgFile: F): Omit<BucketFile, 'bucket'>;

	/** Return the path of a cloud "file object" */
	getPath(obj: F): string;

	exists(path: string): Promise<boolean>;

	/** 
	 * Get and return a BucketFile for a given path (will do a cloud bucket query).
	 * Returns null if not found. Throw exception if any other exception than notfound.  
	 */
	getCloudFile(path: String): Promise<F | null>;

	listCloudFiles(opts: ListCloudFilesOptions): Promise<ListCloudFilesResult>;

	downloadCloudFile(cf: F, localPath: string): Promise<void>;

	uploadCloudFile(localFilePath: string, remoteFilePath: string, contentType?: string): Promise<F>;

	copyCloudFile(cf: F, destDir: BucketFile): Promise<void>;

	deleteCloudFile(path: string): Promise<boolean>;

	downloadAsText(path: string): Promise<string>

	uploadCloudContent(path: string, content: string, contentType?: string): Promise<void>;

	createReadStream(path: string): Promise<Readable>;

	createWriteStream(path: string, contentType?: string): Promise<Writable>;

}

export interface ListCloudFilesResult<F = any> {
	files: F[];
	dirs?: string[];
	nextMarker?: string;
}

export interface BrowseCloudFilesOptions extends ListCloudFilesOptions { }

/** Internal Interface to the list implementation */
export interface ListCloudFilesOptions {
	prefix?: string; // the prefix (only)
	glob?: string; // the eventual glob
	directory?: boolean; // if true, the '/' delimiter will be set (might allow to set specific char later)
	limit?: number;
	marker?: string;
}

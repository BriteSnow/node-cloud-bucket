
import type { Bucket } from './bucket.js';

/////////////////////
// Those are the common types to avoid uncessary cyclic module reference. (best practice)
////

export type BucketType = 's3' | 'gs' | 'minio';

export interface BucketFile {
	bucket: Bucket;
	path: string;
	size?: number;
	updated?: string;
	contentType?: string;
	local?: string; // optional local file path
}

export type BucketFileDeleted = BucketFile & { deleted: boolean };


export interface ListResult {
	files: BucketFile[];
	dirs?: string[];
	nextMarker?: string;
}


/** Interface used for the bucket.list */
export interface ListOptions {
	prefix?: string; // the prefix or glob
	directory?: boolean; // if true, the '/' delimiter will be set (might allow to set specific char later)
	marker?: string;
	limit?: number;
}

/** Argument type for listing a set of bucket item for .list and .download
 * - when string means it is the prefix (which can be of glob format)
 * - when ListOptions prefix can be specified as property.
 */
export type ListArg = ListOptions | string;


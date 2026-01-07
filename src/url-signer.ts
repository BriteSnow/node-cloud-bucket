import * as crypto from 'crypto';

type CloudSignUrlOptions = {
	type: 's3' | 'gs',
	expires: number,
	keyName: string,
	key: string,
}

export type SignUrlOptions = CloudSignUrlOptions | { type: 'minio' };


export function signUrl(url: string, opts: SignUrlOptions) {
	if (opts.type === 's3') {
		return s3_sign_url(url, opts);
	} else if (opts.type === 'gs') {
		return gs_sign_url(url, opts);
	} else if (opts.type === 'minio') {
		return url; // for now passthrough (minio is assumed to be for dev)
	} else {
		throw new Error(`cdnSign does not support type ${opts.type} for now`);
	}
}

/** 
 * Return a path signer based on a baseUrl and the sign option. This is the optimal way to sign many urls and should be typically used over the signUrl method.
 * 
 * ```ts
 * const signer = urlSigner('https://.../some/dir/');
 * const signedUrls = ['my/image-001.jpeg', 'my/file.json'].map(signer);
 * ```
 * 
 * Performance benefits: 
 * 
 * - s3 - This takes full advantage of the aws 'directory signing' like urlSigner('https://.../some/dir/*', opts) will create one signature for the folder and apply it to each sub path.
 * - gs - While google storage does not have the same capability, there are small benefits as well on some base64 object creation (not much though). However, because of GCP small key, the signature is much faster than s3 (about 10x)
 */
export function urlSigner(baseUrl: string, opts: SignUrlOptions): (pathFromBaseUrl: string) => string {
	if (opts.type === 's3') {
		return s3_urlSigner(baseUrl, opts);
	} if (opts.type === 'gs') {
		return gs_urlSigner(baseUrl, opts);
	} if (opts.type === 'minio') {
		// for now, assume no signature on (minio is assumed to be for dev)
		return function (pathFromBaseUrl) {
			return baseUrl + pathFromBaseUrl;
		}
	} else {
		throw new Error('urlSigner only supported for s3');
	}
}


//#region    ---------- S3 Signer ---------- 
function s3_urlSigner(baseUrl: string, opts: CloudSignUrlOptions): (pathFromBaseUrl: string) => string {

	const isWildPolicy = baseUrl.endsWith('*');

	const [base_policyStringified, base_policyB64Norm] = isWildPolicy ? s3_makePolicy(baseUrl, opts.expires) : [undefined, undefined];
	const base_signature = (base_policyStringified) ? s3_sign(base_policyStringified, opts.key) : undefined;
	const base_url = isWildPolicy ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;

	return function (pathFromBaseUrl: string) {
		let signature: string | undefined;
		let policyStringified: string | undefined;
		let policyB64Norm: string | undefined;

		// If we have a base_signature and all, it means we had an a pattern signature (with *) s we can reuse
		if (base_signature && base_policyB64Norm && base_policyStringified) {
			policyStringified = base_policyStringified;
			policyB64Norm = base_policyB64Norm;
			signature = base_signature;
		}
		// otherwise needs to compute the signature
		else {
			[policyStringified, policyB64Norm] = s3_makePolicy(baseUrl + pathFromBaseUrl, opts.expires);
			signature = s3_sign(policyStringified, opts.key);
		}
		return `${base_url}${pathFromBaseUrl}?Expires=${opts.expires}&Policy=${policyB64Norm}&Signature=${signature}&Key-Pair-Id=${opts.keyName}`;;
	}
}

function s3_sign_url(url: string, opts: CloudSignUrlOptions) {

	const [policyStringified, policyB64Norm] = s3_makePolicy(url, opts.expires);
	const signature = s3_sign(policyStringified, opts.key);
	return `${url}?Expires=${opts.expires}&Policy=${policyB64Norm}&Signature=${signature}&Key-Pair-Id=${opts.keyName}`;;
}

function s3_makePolicy(url: string, expires: number) {
	const policyObject = {
		"Statement": [
			{
				"Resource": url,
				"Condition": {
					"DateLessThan": { "AWS:EpochTime": expires }
				}
			}
		]
	};
	const policyStringified = JSON.stringify(policyObject); //.replace(' ', '').replace('\n', '');
	const policyB64Norm = s3_normalize_b64(Buffer.from(policyStringified).toString('base64'));

	return [policyStringified, policyB64Norm];
}

function s3_sign(policyStringified: string, key: string) {
	const signer = crypto.createSign('RSA-SHA1');
	const signatureB64 = signer.update(policyStringified).sign(key, 'base64');
	return s3_normalize_b64(signatureB64);
}

const S3_BASE64_REPLACE = { '+': '-', '/': '~', '=': '_' };
function s3_normalize_b64(val: string) {
	return val.replace(/[+/=]/g, c => (<any>S3_BASE64_REPLACE)[c]);
}

//#endregion ---------- /S3 Signer ----------


//#region    ---------- GCP Signer ---------- 

const GCP_BASE64_REPLACE = { '+': '-', '/': '_', '=': '' };

function gs_urlSigner(baseUrl: string, opts: CloudSignUrlOptions): (pathFromBaseUrl: string) => string {
	// just for API symetry, as gcp does not support wild policy signature
	const isWildPolicy = baseUrl.endsWith('*');

	const su_key_buff = Buffer.from(opts.key, 'base64');
	const base_url = isWildPolicy ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;

	return function (pathFromBaseUrl: string) {
		const url = base_url + pathFromBaseUrl;
		// URL to sign
		const urlToSign = `${url}?Expires=${opts.expires}&KeyName=${opts.keyName}`;
		let signature = crypto.createHmac('sha1', new Uint8Array(su_key_buff)).update(urlToSign).digest('base64');
		signature = signature.replace(/[+/=]/g, c => (<any>GCP_BASE64_REPLACE)[c]);
		// Add signature to urlToSign
		return `${urlToSign}&Signature=${signature}`;
	}
}


function gs_sign_url(url: string, opts: CloudSignUrlOptions) {
	// URL to sign
	const urlToSign = `${url}?Expires=${opts.expires}&KeyName=${opts.keyName}`;

	// Compute signature
	let su_key_buff = Buffer.from(opts.key, 'base64');
	let signature = crypto.createHmac('sha1', new Uint8Array(su_key_buff)).update(urlToSign).digest('base64');
	signature = signature.replace(/[+/=]/g, c => (<any>GCP_BASE64_REPLACE)[c]);

	// Add signature to urlToSign
	return urlToSign + `&Signature=${signature}`;
}

//#endregion ---------- /GCP Signer ---------- 
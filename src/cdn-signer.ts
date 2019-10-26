import * as crypto from 'crypto';

export interface CdnSignOptions {
	type: 's3' | 'gs',
	expires: number,
	keyName: string,
	key: string,
}

export function cdnSign(url: string, opts: CdnSignOptions) {
	if (opts.type === 's3') {
		return s3_sign(url, opts);
	} else if (opts.type === 'gs') {
		return gs_sign(url, opts);
	} else {
		throw new Error(`cdnSign does not support type ${opts.type} for now`);
	}
}


//#region    ---------- S3 Signer ---------- 
function s3_sign(url: string, opts: CdnSignOptions) {

	//// build custom policy
	const policyObject = {
		"Statement": [
			{
				"Resource": url,
				"Condition": {
					"DateLessThan": { "AWS:EpochTime": opts.expires }
				}
			}
		]
	};
	const policyString = JSON.stringify(policyObject); //.replace(' ', '').replace('\n', '');
	const policy = s3_normalize_b64(Buffer.from(policyString).toString('base64'));

	//// build signature
	//const signature = s3_create_normalized_signature(policyObject, opts.key);
	const sign = crypto.createSign('RSA-SHA1');
	const signatureB64 = sign.update(policyString).sign(opts.key, 'base64');
	const signature = s3_normalize_b64(signatureB64);

	//// key per id
	const keyPairId = opts.keyName;

	return `${url}?Expires=${opts.expires}&Policy=${policy}&Signature=${signature}&Key-Pair-Id=${keyPairId}`;
}

const S3_BASE64_REPLACE = { '+': '-', '/': '~', '=': '_' };
function s3_normalize_b64(val: string) {
	return val.replace(/[+/=]/g, c => (<any>S3_BASE64_REPLACE)[c]);
}

//#endregion ---------- /S3 Signer ----------


//#region    ---------- GCP Signer ---------- 

const GCP_BASE64_REPLACE = { '+': '-', '/': '_', '=': '' };

function gs_sign(url: string, opts: CdnSignOptions) {
	// URL to sign
	const urlToSign = `${url}?Expires=${opts.expires}&KeyName=${opts.keyName}`;

	// Compute signature
	let su_key_buff = Buffer.from(opts.key, 'base64');
	let signature = crypto.createHmac('sha1', su_key_buff).update(urlToSign).digest('base64');
	signature = signature.replace(/[+/=]/g, c => (<any>GCP_BASE64_REPLACE)[c]);

	// Add signature to urlToSign
	return urlToSign + `&Signature=${signature}`;
}

//#endregion ---------- /GCP Signer ---------- 
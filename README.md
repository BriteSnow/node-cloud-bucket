Simple cross cloud (for now GCP and AWS) bucket API. 

**Current Features:**
- Supports AWS, GCP, and Minio (for mock only)
- Directory support (i.e. directory: true makes .dirs = string[])
- Promise/async/await based.
- signed url (with urlSigner supporting s3 wildcard signature)
- Glob support (processed on the nodejs side)
- Typed (Typescript)

**Roadmap:**
- Stream copy between bucket
- Azure support


## Usage

- `npm install cloud-bucket`

```ts
import {getBucket} from 'cloud-bucket';

// For AWS S3 (or minio)
const bucketCfg = { 
  bucketName: '_BUCKET_NAME_',
  access_key_id: "_AWS_ACCESS_KEY_ID_",
  access_key_secret: "_AWS_ACCESS_KEY_SECRET_",
  minio_endpoint: "http://localhost:9000" // for minio (for mock s3)
};

// for google bucket
const bucketCfg = {
  bucketName: '_BUCKET_NAME_',
  project_id: '_GOOGLE_PROJECT_ID_NAME_',
  client_email: '_GOOGLE_SERVICE_ACCOUNT_EMAIL_',
  private_key: '-----BEGIN PRIVATE KEY-----\n_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_WITH_NEW_LINE_\n-----END PRIVATE KEY-----'
}


const bucket = await getBucket(bucketCfg);

//// Uploads
const file = await bucket.getFile('/some-file.txt');
// Return BucketFile or null if not found, throws exception if other error.

// upload to a folder
const remoteFiles = await bucket.upload('./some-file.txt', 'in-this-folder/');
// [{Bucket:..., 
//  path: 'in-this-folder/some-file.txt', 
//  size: 34, // size in bytes
//  local: './some-file.txt' // only present for upload/download
//  }]

// will upload to a specific name
const remoteFiles = await bucket.upload('./some-file.txt', 'in-this-folder/new-name.txt');

// upload a full folder remotely (recursive)
const remoteFiles = await bucket.upload('./some-dir/', 'remote-base-dir/');


//// List

const files = await bucket.listFiles();
// files: File[] (all files contained in this bucket, no pagination yet)

const files = await bucket.listFiles('in-this-folder/', {limit: 300});
// files: File[] (only file with the prefix 'in-this-folder/) and only the first 300;

const files = await bucket.listFiles('in-this-folder/**/*.txt');
// files: File[] (only file with the prefix 'in-this-folder/ and matching the glob);
// Note: Glob processing happen on the nodejs side.

// More result info by calling the list method. 
const listResult = await bucket.list('in-this-folder/', {directory: true});
// {files: BucketFile[], dirs?: string[], nextMarker}


//// Download

const files = await bucket.download('in-this-folder/some-file.txt', './local-dir/');
// files: [{
//   Bucket:  ...,
//   path: 'in-this-folder/some-file.txt',
//   size: 34,
//   local: `./local-dir/some-file.txt'
// }]

const files = await bucket.download('in-this-folder/**/*.txt', './local-dir/');
// Note: When glob as src, then, sub folder from the base path will be added in the local-dir
// files: [{
//   Bucket:  ...,
//   path: 'in-this-folder/some-file.txt',
//   size: 34,
//   local: `./local-dir/some-file.txt'
// },{
//   Bucket:  ...,
//   path: 'in-this-folder/sub-dir/another-file.txt',
//   size: 34,
//   local: `./local-dir/sub-dir/another-file.txt'
// },
//]

const deleted = await bucket.delete('some-file.txt');
// return true if deleted, false if not found, throws exception if other error.

```


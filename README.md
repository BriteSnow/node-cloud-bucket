Simple cross cloud (for now GCP and AWS) bucket API. 

**Current Features:**
- Supports AWS, GCP. 
- Promise/async/await based.
- Glob support (processed on the nodejs side)
- Typed (Typescript)
- SIMPLE

**Roadmap:**
- Stream copy between bucket
- Azure support
- API Refresh


## Usage

- `npm install cloud-bucket`

```ts
import {getBucket} from 'cloud-bucket';

const bucketCfg = {
  bucketName: '_BUCKET_NAME_'
  access_key_id: "_AWS_ACCESS_KEY_ID_"
  access_key_secret: "_AWS_ACCESS_KEY/_SECRET_"
};

const bucket = await getBucket(bucketCfg);

//// Uploads

const file = await bucket.upload('./some-file.txt', 'in-this-folder/');
// {Bucket:..., 
//  path: 'in-this-folder/some-file.txt', 
//  size: 34, // size in bytes
//  local: './some-file.txt' // only present for upload/download
//  } 

const file = await bucket.upload('./some-file.txt', 'in-this-folder/new-name.txt');
// will upload to a specific name


//// List

const files = await bucket.list();
// files: File[] (all files contained in this bucket, no pagination yet)

const files = await bucket.list('in-this-folder/');
// files: File[] (only file with the prefix 'in-this-folder/);

const files = await bucket.list('in-this-folder/**/*.txt');
// files: File[] (only file with the prefix 'in-this-folder/ and matching the glob);
// Note: Glob processing happen on the nodejs side.

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

```

For Google Cloud Storage, just use (the `getBucket` API will auto-detect the type of cloud from the config object): 

```ts
const bucketCfg = {
  bucketName: '_GOOGLE_BUCKET_NAME_',
  project_id: '_GOOGLE_PROJECT_ID_NAME_',
  client_email: '_GOOGLE_SERVICE_ACCOUNT_EMAIL_',
  private_key: '-----BEGIN PRIVATE KEY-----\n_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_WITH_NEW_LINE_\n-----END PRIVATE KEY-----'
}
```
> Note: Minor update dependencies only are not recorded here (but still tagged)

### [v0.3.4](https://github.com/BriteSnow/node-cloud-bucket/compare/v0.3.3...v0.3.4) July 19, 2020

- `+` minio - Added support for minio (for dev/mock only for now).

### [v0.3.3](https://github.com/BriteSnow/node-cloud-bucket/compare/v0.3.2...v0.3.3) June 12, 2020

- `+` stream - add content type support for createStream

### [v0.3.2](https://github.com/BriteSnow/node-cloud-bucket/compare/v0.3.0...v0.3.2) June 9, 2020

- `!` log - removed console.log by default, added .log: boolean

### [v0.3.0](https://github.com/BriteSnow/node-cloud-bucket/compare/v0.2.16...v0.3.0) May 21, 2020

- `!` Rename `bucket.list` to `bucket.listFiles` and change the `bucket.list` to return `ListResult` (allow full pagination and other metadata information)

### [v0.2.16](https://github.com/BriteSnow/node-cloud-bucket/compare/v0.2.15...v0.2.16) Apr 16 2020

- s3 upload - move to stream to upload to s3
- refactoring to driver pattern
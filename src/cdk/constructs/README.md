# WDK Constructs

Best practice CDK constructs for common AWS resources. These constructs provide opinionated, secure, and production-ready implementations with built-in best practices.

## Available Constructs

- [WdkS3](#wdks3) - Best practice S3 bucket with security and lifecycle management
- [WdkKinesisStream](#wdkkinesisstream) - Best practice Kinesis Data Stream with monitoring

---

### WdkS3

A best practice S3 bucket construct with comprehensive security and lifecycle management.

**Important**: WdkS3 uses project-wide lifecycle defaults configured during `conjure init`. These defaults are stored in `wdk/wdk-s3-defaults.json` and apply to all buckets created with this construct.

#### Features

- ✅ **Encryption at Rest**: S3 managed encryption or custom KMS key
- ✅ **Block Public Access**: All public access blocked by default
- ✅ **Versioning**: Enabled by default for data protection
- ✅ **Server Access Logging**: Automatic logging to a dedicated bucket
- ✅ **Intelligent Tiering**: Cost optimization through automatic storage class transitions
- ✅ **Lifecycle Rules**: Standard rules for cost optimization and cleanup
- ✅ **SSL Enforcement**: Enforces TLS 1.2+ for all requests
- ✅ **Secure Defaults**: Object ownership enforcement, no public read access
- ✅ **Multipart Upload Cleanup**: Automatically aborts incomplete uploads after 7 days
- ✅ **Version Management**: Automatic expiration and transition of old versions

#### Basic Usage

```typescript
import { WdkS3 } from './constructs';

// In a WdkModule, get the prefix
const prefix = this.getPrefix(); // Returns '{prefixName}-{stageName}'

// Simple bucket with all defaults
// Automatically uses the foundation access logs bucket
const bucket = new WdkS3(this, 'MyBucket', {
  prefix: prefix,
  bucketName: `${prefix}-my-bucket`,
});

// Access the underlying S3 bucket
console.log(bucket.bucketName);
console.log(bucket.bucketArn);
```

#### Advanced Usage

```typescript
import { WdkS3 } from './constructs';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';

// Get foundation resources
const prefix = this.getPrefix();
const encryptionKey = this.getFoundationEncryptionKey();

const bucket = new WdkS3(this, 'MyBucket', {
  prefix: prefix,
  bucketName: `${prefix}-my-bucket`,
  encryptionKey: encryptionKey,
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
  versioned: true,
  serverAccessLogsPrefix: `${this.moduleName}/my-bucket/`,
});

// Grant permissions
bucket.grantReadWrite(myLambdaFunction);

// Add custom lifecycle rule
bucket.addLifecycleRule({
  id: 'ArchiveOldData',
  enabled: true,
  prefix: 'archive/',
  transitions: [
    {
      storageClass: s3.StorageClass.GLACIER,
      transitionAfter: Duration.days(180),
    },
  ],
});

// Add CORS rule
bucket.addCorsRule({
  allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
  allowedOrigins: ['https://example.com'],
  allowedHeaders: ['*'],
});
```

#### Configuration Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `prefix` | `string` | **Required** | Project prefix and stage (e.g., 'myproject-dev') |
| `bucketName` | `string` | Auto-generated | The name of the S3 bucket |
| `removalPolicy` | `RemovalPolicy` | `RETAIN` | What happens to the bucket when the stack is deleted |
| `autoDeleteObjects` | `boolean` | `false` | Auto-delete objects when bucket is removed (requires DESTROY policy) |
| `encryptionKey` | `kms.IKey` | `undefined` | Custom KMS key (uses S3 managed encryption if not provided) |
| `versioned` | `boolean` | `true` | Enable versioning |
| `serverAccessLogsEnabled` | `boolean` | `true` | Enable server access logging |
| `serverAccessLogsBucketNameOverride` | `string` | `'{prefix}-access-logs'` | Override the foundation access logs bucket name |
| `serverAccessLogsPrefix` | `string` | `'access-logs/'` | Prefix for access logs within the logs bucket |
| `applyDefaultLifecycleRules` | `boolean` | `true` | Apply default lifecycle rules |
| `enableIntelligentTiering` | `boolean` | `true` | Enable intelligent tiering |
| `enforceSSL` | `boolean` | `true` | Enforce SSL for all requests |
| `eventBridgeEnabled` | `boolean` | `false` | Enable EventBridge notifications |
| `cors` | `s3.CorsRule[]` | `undefined` | CORS configuration |
| `lifecycleRules` | `s3.LifecycleRule[]` | Default rules | Custom lifecycle rules |

#### Default Lifecycle Rules

When `applyDefaultLifecycleRules` is `true` (default), the following rules are applied based on your project's `wdk-s3-defaults.json` configuration:

1. **Intelligent Tiering**: Immediately transitions objects to INTELLIGENT_TIERING storage class (if enabled)
2. **Deep Archive Transition**: Transitions objects to DEEP_ARCHIVE after the configured number of days (if enabled during init)
3. **Expiration**: Permanently deletes objects after the configured number of days (if enabled during init)
4. **Multipart Upload Cleanup**: Aborts incomplete multipart uploads after 7 days
5. **Version Management** (if versioning enabled):
   - Non-current versions expire after 90 days
   - Non-current versions transition to INFREQUENT_ACCESS after 30 days

**Note**: The Deep Archive and Expiration policies are configured during project initialization (`conjure init`) and apply to all WdkS3 buckets by default. You can override these by providing custom `lifecycleRules` in the bucket properties.

#### Project-Wide Lifecycle Configuration

The `wdk/wdk-s3-defaults.json` file contains project-wide lifecycle defaults:

```json
{
  "deepArchiveTransitionEnabled": true,
  "deepArchiveTransitionUnit": "years",
  "deepArchiveTransitionValue": 1,
  "expirationEnabled": true,
  "expirationUnit": "years",
  "expirationValue": 7
}
```

**Configuration Options:**
- `deepArchiveTransitionEnabled`: Enable automatic transition to Deep Archive storage
- `deepArchiveTransitionUnit`: Time unit (`"days"`, `"weeks"`, `"months"`, `"years"`)
- `deepArchiveTransitionValue`: Number of units before transitioning
- `expirationEnabled`: Enable automatic deletion of old objects
- `expirationUnit`: Time unit (`"days"`, `"weeks"`, `"months"`, `"years"`)
- `expirationValue`: Number of units before permanent deletion

**Note**: The construct uses CDK's `Duration` class internally, converting units appropriately:
- Weeks = 7 days
- Months = 31 days (accounts for longest month)
- Years = 366 days (accounts for leap years)

These conversions err on the side of caution for compliance purposes.

You can manually edit this file to change the defaults for all future bucket deployments. Changes take effect on the next `cdk deploy`.

#### Methods

- `grantRead(identity)`: Grant read permissions
- `grantWrite(identity)`: Grant write permissions
- `grantReadWrite(identity)`: Grant read/write permissions
- `grantDelete(identity)`: Grant delete permissions
- `grantPut(identity)`: Grant put permissions
- `addLifecycleRule(rule)`: Add a lifecycle rule
- `addCorsRule(rule)`: Add a CORS rule

#### Properties

- `bucket`: The underlying S3 bucket instance
- `accessLogsBucket`: The access logs bucket (if created)
- `bucketArn`: The bucket ARN
- `bucketName`: The bucket name
- `bucketDomainName`: The bucket domain name
- `bucketRegionalDomainName`: The bucket regional domain name
- `bucketWebsiteUrl`: The bucket website URL

## Best Practices

### Security

1. **Never disable public access blocking** unless absolutely necessary
2. **Always use encryption** - prefer KMS for sensitive data
3. **Enable versioning** for important data to protect against accidental deletion
4. **Enable access logging** for audit trails and security analysis
5. **Use SSL enforcement** to ensure data in transit is encrypted

### Cost Optimization

1. **Use Intelligent Tiering** for unpredictable access patterns
2. **Set lifecycle rules** to transition or expire old data
3. **Clean up incomplete multipart uploads** to avoid storage costs
4. **Manage old versions** if versioning is enabled

### Operations

1. **Use descriptive bucket names** that follow your naming conventions
2. **Set appropriate removal policies** - use RETAIN for production data
3. **Enable EventBridge** if you need to react to bucket events
4. **Monitor access logs** regularly for security and usage patterns

## Examples

### Data Lake Bucket

```typescript
const dataLakeBucket = new WdkS3(this, 'DataLake', {
  bucketName: `${projectPrefix}-${stage}-data-lake`,
  versioned: true,
  lifecycleRules: [
    {
      id: 'TransitionRawData',
      enabled: true,
      prefix: 'raw/',
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: Duration.days(90),
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(365),
        },
      ],
    },
  ],
});
```

### Static Website Assets

```typescript
const assetsBucket = new WdkS3(this, 'Assets', {
  bucketName: `${projectPrefix}-${stage}-assets`,
  versioned: false,
  cors: [
    {
      allowedMethods: [s3.HttpMethods.GET],
      allowedOrigins: ['*'],
      allowedHeaders: ['*'],
      maxAge: 3600,
    },
  ],
});
```

### Backup Bucket

```typescript
const backupBucket = new WdkS3(this, 'Backups', {
  bucketName: `${projectPrefix}-${stage}-backups`,
  versioned: true,
  removalPolicy: RemovalPolicy.RETAIN,
  lifecycleRules: [
    {
      id: 'RetainBackups',
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(30),
        },
        {
          storageClass: s3.StorageClass.DEEP_ARCHIVE,
          transitionAfter: Duration.days(90),
        },
      ],
      expiration: Duration.days(2555), // 7 years
    },
  ],
});
```

---

### WdkKinesisStream

A best practice Kinesis Data Stream construct with encryption, monitoring, and configurable capacity.

#### Features

- ✅ **KMS Encryption**: Customer-managed or AWS-managed encryption
- ✅ **Flexible Capacity**: Support for PROVISIONED and ON_DEMAND modes
- ✅ **Configurable Retention**: 24 hours to 365 days
- ✅ **CloudWatch Alarms**: Built-in monitoring for throughput and lag
- ✅ **Enhanced Monitoring**: Optional shard-level metrics
- ✅ **Secure Defaults**: Encryption enabled, 24-hour retention
- ✅ **Helper Methods**: Grant read/write permissions easily

#### Basic Usage

```typescript
import { WdkKinesisStream } from './constructs';

// In a WdkModule
const prefix = this.getPrefix();
const encryptionKey = this.getFoundationEncryptionKey();

const stream = new WdkKinesisStream(this, 'CTRStream', {
  prefix: prefix,
  streamName: `${prefix}-contact-trace-records`,
  encryptionKey: encryptionKey,
  retentionPeriod: Duration.hours(24),
  shardCount: 1,
});

// Grant permissions to a Lambda function
stream.grantWrite(myLambda);
stream.grantRead(consumerLambda);
```

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `prefix` | `string` | **Required** | Project prefix and stage |
| `streamName` | `string` | **Required** | Name of the Kinesis stream |
| `encryptionKey` | `kms.IKey` | AWS managed | KMS key for encryption |
| `streamMode` | `StreamMode` | `PROVISIONED` | Stream capacity mode |
| `shardCount` | `number` | `1` | Number of shards (PROVISIONED mode only) |
| `retentionPeriod` | `Duration` | `Duration.hours(24)` | Data retention period (24h - 365 days) |
| `removalPolicy` | `RemovalPolicy` | `RETAIN` | Removal policy for the stream |
| `enhancedMonitoring` | `boolean` | `false` | Enable shard-level metrics |
| `createAlarms` | `boolean` | `true` | Create CloudWatch alarms |

#### CloudWatch Alarms

When `createAlarms` is `true`, the following alarms are automatically created:

1. **Write Throughput Exceeded**: Alerts when write capacity is exceeded
2. **Read Throughput Exceeded**: Alerts when read capacity is exceeded
3. **Iterator Age High**: Alerts when processing lag exceeds 1 minute

#### Methods

- `grantRead(identity)`: Grant read permissions
- `grantWrite(identity)`: Grant write permissions
- `grantReadWrite(identity)`: Grant read/write permissions
- `streamArn`: Get the stream ARN
- `streamName`: Get the stream name

#### Advanced Usage

**ON_DEMAND Mode:**
```typescript
const stream = new WdkKinesisStream(this, 'OnDemandStream', {
  prefix: prefix,
  streamName: `${prefix}-on-demand-stream`,
  encryptionKey: encryptionKey,
  streamMode: StreamMode.ON_DEMAND,
  retentionPeriod: Duration.hours(168), // 7 days
});
```

**Extended Retention:**
```typescript
const stream = new WdkKinesisStream(this, 'LongRetentionStream', {
  prefix: prefix,
  streamName: `${prefix}-long-retention-stream`,
  encryptionKey: encryptionKey,
  retentionPeriod: Duration.days(365), // Maximum retention
  shardCount: 2,
});
```

**With Enhanced Monitoring:**
```typescript
const stream = new WdkKinesisStream(this, 'MonitoredStream', {
  prefix: prefix,
  streamName: `${prefix}-monitored-stream`,
  encryptionKey: encryptionKey,
  enhancedMonitoring: true,
  createAlarms: true,
});
```

#### Best Practices

1. **Use KMS Encryption**: Always provide a KMS key for sensitive data
2. **Set Appropriate Retention**: Balance between recovery needs and costs
3. **Monitor Iterator Age**: High iterator age indicates processing lag
4. **Start with 1 Shard**: Scale up based on actual throughput needs
5. **Use ON_DEMAND for Variable Load**: Better for unpredictable traffic patterns
6. **Enable Alarms**: Monitor for throughput issues proactively

#### Cost Optimization

- **PROVISIONED Mode**: Fixed cost based on shard count ($0.015/shard/hour)
- **ON_DEMAND Mode**: Pay per GB ingested and retrieved
- **Retention**: Longer retention = higher storage costs
- **Enhanced Monitoring**: Additional cost for shard-level metrics

**Example Cost (PROVISIONED):**
- 1 shard, 24-hour retention: ~$11/month
- 2 shards, 7-day retention: ~$22/month + storage
- 5 shards, 30-day retention: ~$55/month + storage

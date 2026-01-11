# Using Foundation Resources

The foundation stack provides shared resources that can be used across all modules in your WDK project. These resources are designed to promote consistency, security, and best practices.

## Available Foundation Resources

### 1. KMS Encryption Key

A centralized KMS key with automatic key rotation enabled. This key can be used to encrypt S3 buckets, DynamoDB tables, and other AWS resources across all modules.

**Benefits:**
- Centralized key management
- Automatic key rotation enabled
- Consistent encryption across all modules
- Simplified access control and auditing

### 2. Access Logs Bucket

A centralized S3 bucket for storing access logs from all S3 buckets in your modules. This bucket has lifecycle rules to automatically transition logs to cheaper storage classes and delete old logs.

**Benefits:**
- Centralized log storage for easier analysis
- Cost optimization through lifecycle rules
- Consistent logging configuration
- Simplified compliance and auditing

## How to Use Foundation Resources

### In Your Module Stack

The `WdkModule` base class provides helper methods to access foundation resources:

```typescript
import { WdkModule, WdkModuleProps } from '../wdk/wdk-module';
import { WdkS3 } from '../wdk/constructs';
import { Construct } from 'constructs';

export class MyModuleStack extends WdkModule {
  protected initialize(): void {
    // Get foundation resources
    const encryptionKey = this.getFoundationEncryptionKey();
    const accessLogsBucket = this.getFoundationAccessLogsBucket();
    
    // Use them with WdkS3 construct
    const dataBucket = new WdkS3(this, 'DataBucket', {
      bucketName: `${this.prefixName}-${this.stageName}-${this.moduleName}-data`,
      encryptionKey: encryptionKey,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `${this.moduleName}/data-bucket/`,
      versioned: true,
    });
  }
}
```

### Helper Methods

#### `getFoundationEncryptionKey()`

Returns a reference to the KMS key created in the foundation stack.

```typescript
protected getFoundationEncryptionKey(): kms.IKey
```

**Example:**
```typescript
const encryptionKey = this.getFoundationEncryptionKey();

// Use with S3
const bucket = new WdkS3(this, 'Bucket', {
  encryptionKey: encryptionKey,
});

// Use with DynamoDB
const table = new dynamodb.Table(this, 'Table', {
  encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: encryptionKey,
});

// Grant decrypt access to a Lambda function
encryptionKey.grantDecrypt(myLambdaFunction);
```

#### `getFoundationAccessLogsBucket()`

Returns a reference to the centralized access logs bucket.

```typescript
protected getFoundationAccessLogsBucket(): s3.IBucket
```

**Example:**
```typescript
const accessLogsBucket = this.getFoundationAccessLogsBucket();

// Use with WdkS3
const bucket = new WdkS3(this, 'Bucket', {
  serverAccessLogsBucket: accessLogsBucket,
  serverAccessLogsPrefix: `${this.moduleName}/my-bucket/`,
});

// Use with standard S3 bucket
const standardBucket = new s3.Bucket(this, 'StandardBucket', {
  serverAccessLogsBucket: accessLogsBucket,
  serverAccessLogsPrefix: `${this.moduleName}/standard-bucket/`,
});
```

## Complete Example

Here's a complete example of a module that uses all foundation resources:

```typescript
import { WdkModule, WdkModuleProps } from '../wdk/wdk-module';
import { WdkS3 } from '../wdk/constructs';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export interface DataProcessingStackProps extends WdkModuleProps {}

export class DataProcessingStack extends WdkModule {
  protected initialize(): void {
    // Get foundation resources
    const encryptionKey = this.getFoundationEncryptionKey();
    const accessLogsBucket = this.getFoundationAccessLogsBucket();
    
    // Create input bucket with foundation resources
    const inputBucket = new WdkS3(this, 'InputBucket', {
      bucketName: `${this.prefixName}-${this.stageName}-${this.moduleName}-input`,
      encryptionKey: encryptionKey,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `${this.moduleName}/input/`,
      versioned: true,
      eventBridgeEnabled: true,
    });
    
    // Create output bucket with foundation resources
    const outputBucket = new WdkS3(this, 'OutputBucket', {
      bucketName: `${this.prefixName}-${this.stageName}-${this.moduleName}-output`,
      encryptionKey: encryptionKey,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `${this.moduleName}/output/`,
      versioned: true,
    });
    
    // Create DynamoDB table with foundation encryption key
    const metadataTable = new dynamodb.Table(this, 'MetadataTable', {
      tableName: `${this.prefixName}-${this.stageName}-${this.moduleName}-metadata`,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: encryptionKey,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    
    // Create Lambda function
    const processorFunction = new lambda.Function(this, 'Processor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        INPUT_BUCKET: inputBucket.bucketName,
        OUTPUT_BUCKET: outputBucket.bucketName,
        METADATA_TABLE: metadataTable.tableName,
      },
    });
    
    // Grant permissions
    inputBucket.grantRead(processorFunction);
    outputBucket.grantWrite(processorFunction);
    metadataTable.grantReadWriteData(processorFunction);
    encryptionKey.grantDecrypt(processorFunction);
    
    // Create shareable outputs
    this.createOutput('InputBucketName', inputBucket.bucketName, 'string', true);
    this.createOutput('OutputBucketName', outputBucket.bucketName, 'string', true);
    this.createOutput('MetadataTableName', metadataTable.tableName, 'string', true);
  }
}
```

## Best Practices

### 1. Always Use Foundation Resources

When creating S3 buckets or encrypted resources, always use the foundation KMS key and access logs bucket:

✅ **Good:**
```typescript
const bucket = new WdkS3(this, 'Bucket', {
  encryptionKey: this.getFoundationEncryptionKey(),
  serverAccessLogsBucket: this.getFoundationAccessLogsBucket(),
  serverAccessLogsPrefix: `${this.moduleName}/`,
});
```

❌ **Avoid:**
```typescript
// Don't create separate KMS keys or log buckets per module
const myKey = new kms.Key(this, 'MyKey', {});
const myLogsBucket = new s3.Bucket(this, 'MyLogs', {});
```

### 2. Use Consistent Log Prefixes

Organize logs by module and bucket name:

```typescript
serverAccessLogsPrefix: `${this.moduleName}/bucket-name/`
```

This makes it easier to analyze logs and troubleshoot issues.

### 3. Grant Minimal Permissions

Only grant the permissions your resources need:

```typescript
// Good: Only grant decrypt if you're reading encrypted data
encryptionKey.grantDecrypt(myLambdaFunction);

// Avoid: Don't grant full key access unless necessary
// encryptionKey.grant(myLambdaFunction, 'kms:*');
```

### 4. Use WdkS3 Construct

The `WdkS3` construct is designed to work seamlessly with foundation resources:

```typescript
const bucket = new WdkS3(this, 'Bucket', {
  encryptionKey: this.getFoundationEncryptionKey(),
  serverAccessLogsBucket: this.getFoundationAccessLogsBucket(),
  serverAccessLogsPrefix: `${this.moduleName}/`,
});
```

### 5. Document Your Usage

When creating outputs, document which foundation resources are used:

```typescript
this.createOutput('BucketName', bucket.bucketName, 'string', true);
this.createOutput('BucketEncryption', 'KMS (foundation key)', 'string', false);
this.createOutput('AccessLogging', 'Enabled (foundation bucket)', 'string', false);
```

## Foundation Stack Outputs

The foundation stack exports the following values that can be imported by modules:

| Export Name | Description | Type |
|-------------|-------------|------|
| `{prefix}-{stage}-encryption-key-id` | KMS Key ID | String |
| `{prefix}-{stage}-encryption-key-arn` | KMS Key ARN | ARN |
| `{prefix}-{stage}-access-logs-bucket-name` | Access Logs Bucket Name | String |
| `{prefix}-{stage}-access-logs-bucket-arn` | Access Logs Bucket ARN | ARN |
| `{prefix}-{stage}-config-table-name` | Config Table Name | String |
| `{prefix}-{stage}-config-table-arn` | Config Table ARN | ARN |

## Troubleshooting

### Error: "No export named {prefix}-{stage}-encryption-key-arn found"

This error occurs when the foundation stack hasn't been deployed yet. Make sure to:

1. Deploy the foundation stack first: `cdk deploy {prefix}-{stage}-foundation`
2. Then deploy your module: `cdk deploy {prefix}-{stage}-{module}`

### Error: "Access Denied" when accessing KMS key

Make sure your resource has been granted the appropriate permissions:

```typescript
const encryptionKey = this.getFoundationEncryptionKey();
encryptionKey.grantDecrypt(myResource);
```

### Error: "Access Denied" when writing to access logs bucket

The access logs bucket has special permissions for S3 to write logs. Make sure you're using it correctly:

```typescript
// Correct: Use as serverAccessLogsBucket
const bucket = new WdkS3(this, 'Bucket', {
  serverAccessLogsBucket: this.getFoundationAccessLogsBucket(),
});

// Incorrect: Don't try to write directly to the logs bucket
// accessLogsBucket.grantWrite(myLambda); // This won't work as expected
```

## Advanced Usage

### Using Foundation Key with Other Services

```typescript
const encryptionKey = this.getFoundationEncryptionKey();

// SNS Topic
const topic = new sns.Topic(this, 'Topic', {
  masterKey: encryptionKey,
});

// SQS Queue
const queue = new sqs.Queue(this, 'Queue', {
  encryption: sqs.QueueEncryption.KMS,
  encryptionMasterKey: encryptionKey,
});

// EFS File System
const fileSystem = new efs.FileSystem(this, 'FileSystem', {
  encrypted: true,
  kmsKey: encryptionKey,
});
```

### Analyzing Access Logs

Access logs are stored in the foundation bucket with the following structure:

```
{prefix}-{stage}-access-logs/
  ├── module1/
  │   ├── bucket1/
  │   │   └── 2024-01-15-12-00-00-ABC123
  │   └── bucket2/
  │       └── 2024-01-15-12-00-00-DEF456
  └── module2/
      └── bucket1/
          └── 2024-01-15-12-00-00-GHI789
```

You can use AWS Athena or S3 Select to query these logs for analysis.

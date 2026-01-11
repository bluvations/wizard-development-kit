# WdkS3 Usage Examples

This document provides practical examples of using the WdkS3 construct in your WDK module stacks.

## Basic Module Stack Example

```typescript
import { WdkModule, WdkModuleProps } from '../wdk/wdk-module';
import { Construct } from 'constructs';
import { WdkS3 } from '../wdk/constructs';
import * as cdk from 'aws-cdk-lib';

export interface MyModuleStackProps extends WdkModuleProps {}

export class MyModuleStack extends WdkModule {
  protected initialize(): void {
    // Get the prefix for foundation resources
    const prefix = this.getPrefix(); // Returns '{prefixName}-{stageName}'

    // Create a simple bucket with all best practices
    // Automatically uses the foundation access logs bucket
    const dataBucket = new WdkS3(this, 'DataBucket', {
      prefix: prefix,
      bucketName: `${prefix}-${this.moduleName}-data`,
      serverAccessLogsPrefix: `${this.moduleName}/data-bucket/`,
    });

    // Create shareable output
    this.createOutput('DataBucketName', dataBucket.bucketName, 'string', true);
  }
}
```

## Multi-Bucket Architecture

```typescript
import { WdkModule, WdkModuleProps } from '../wdk/wdk-module';
import { Construct } from 'constructs';
import { WdkS3 } from '../wdk/constructs';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';

export interface DataPipelineStackProps extends WdkModuleProps {}

export class DataPipelineStack extends WdkModule {
  public readonly rawBucket: WdkS3;
  public readonly processedBucket: WdkS3;
  public readonly archiveBucket: WdkS3;

  protected initialize(): void {
    const prefix = this.getPrefix();

    // Raw data ingestion bucket
    this.rawBucket = new WdkS3(this, 'RawData', {
      prefix: prefix,
      bucketName: `${prefix}-${this.moduleName}-raw`,
      versioned: true,
      eventBridgeEnabled: true, // Enable for triggering Lambda on upload
      serverAccessLogsPrefix: `${this.moduleName}/raw/`,
      lifecycleRules: [
        {
          id: 'MoveToProcessed',
          enabled: true,
          expiration: Duration.days(30), // Delete after 30 days
        },
      ],
    });

    // Processed data bucket
    this.processedBucket = new WdkS3(this, 'ProcessedData', {
      prefix: prefix,
      bucketName: `${prefix}-${this.moduleName}-processed`,
      versioned: true,
      enableIntelligentTiering: true,
      serverAccessLogsPrefix: `${this.moduleName}/processed/`,
    });

    // Long-term archive bucket
    this.archiveBucket = new WdkS3(this, 'Archive', {
      prefix: prefix,
      bucketName: `${prefix}-${this.moduleName}-archive`,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      serverAccessLogsPrefix: `${this.moduleName}/archive/`,
      lifecycleRules: [
        {
          id: 'ArchiveTransition',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(365),
            },
          ],
        },
      ],
    });
  }
}
```

## With Lambda Integration

```typescript
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WdkS3 } from './constructs';
import { aws_lambda as lambda, aws_lambda_nodejs as nodejs } from 'aws-cdk-lib';
import { aws_s3_notifications as s3n } from 'aws-cdk-lib';

export class ImageProcessingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Upload bucket for raw images
    const uploadBucket = new WdkS3(this, 'UploadBucket', {
      bucketName: `${this.stackName}-uploads`,
      versioned: false,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['https://myapp.com'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // Processed images bucket
    const processedBucket = new WdkS3(this, 'ProcessedBucket', {
      bucketName: `${this.stackName}-processed`,
      versioned: false,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 86400,
        },
      ],
    });

    // Lambda function to process images
    const processorFunction = new nodejs.NodejsFunction(this, 'ImageProcessor', {
      entry: 'lambda/image-processor.ts',
      handler: 'handler',
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        PROCESSED_BUCKET: processedBucket.bucketName,
      },
    });

    // Grant permissions
    uploadBucket.grantRead(processorFunction);
    processedBucket.grantWrite(processorFunction);

    // Trigger Lambda on upload
    uploadBucket.bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processorFunction),
      { suffix: '.jpg' }
    );
  }
}
```

## With KMS Encryption

```typescript
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WdkS3 } from './constructs';
import { aws_kms as kms } from 'aws-cdk-lib';

export class SecureDataStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create KMS key for encryption
    const encryptionKey = new kms.Key(this, 'BucketKey', {
      enableKeyRotation: true,
      description: 'KMS key for secure data bucket',
      alias: `${this.stackName}-bucket-key`,
    });

    // Create bucket with KMS encryption
    const secureBucket = new WdkS3(this, 'SecureBucket', {
      bucketName: `${this.stackName}-secure`,
      encryptionKey: encryptionKey,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Grant decrypt access to a role
    encryptionKey.grantDecrypt(myRole);
    secureBucket.grantRead(myRole);
  }
}
```

## Development vs Production Configuration

```typescript
import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WdkS3 } from './constructs';

interface MyStackProps extends StackProps {
  stage: string;
}

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);

    const isProduction = props.stage === 'prod';

    const bucket = new WdkS3(this, 'DataBucket', {
      bucketName: `${this.stackName}-data`,
      versioned: isProduction, // Only version in production
      removalPolicy: isProduction 
        ? RemovalPolicy.RETAIN 
        : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction, // Only auto-delete in dev
      serverAccessLogsEnabled: isProduction, // Only log in production
    });
  }
}
```

## Static Website Hosting

```typescript
import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WdkS3 } from './constructs';
import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';
import { aws_cloudfront_origins as origins } from 'aws-cdk-lib';

export class WebsiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Website assets bucket
    const websiteBucket = new WdkS3(this, 'WebsiteBucket', {
      bucketName: `${this.stackName}-website`,
      versioned: false,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    });

    // Output the CloudFront URL
    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution URL',
    });
  }
}
```

## Backup and Disaster Recovery

```typescript
import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WdkS3 } from './constructs';
import { aws_s3 as s3 } from 'aws-cdk-lib';

export class BackupStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Primary backup bucket
    const backupBucket = new WdkS3(this, 'BackupBucket', {
      bucketName: `${this.stackName}-backups`,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'BackupRetention',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(365),
            },
          ],
          expiration: Duration.days(2555), // 7 years
        },
      ],
    });

    // Enable replication to another region (requires manual setup)
    // This is a reminder to set up cross-region replication for DR
    new cdk.CfnOutput(this, 'BackupBucketArn', {
      value: backupBucket.bucketArn,
      description: 'Backup bucket ARN - configure cross-region replication',
    });
  }
}
```

## Shared Access Logs Bucket

```typescript
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WdkS3 } from './constructs';

export class LoggingStack extends Stack {
  public readonly logsBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create a centralized logs bucket
    const centralLogsBucket = new WdkS3(this, 'CentralLogs', {
      bucketName: `${this.stackName}-logs`,
      versioned: false,
      serverAccessLogsEnabled: false, // Don't log the logs bucket
      lifecycleRules: [
        {
          id: 'DeleteOldLogs',
          enabled: true,
          expiration: Duration.days(90),
        },
      ],
    });

    this.logsBucket = centralLogsBucket.bucket;

    // Use this bucket for other buckets' access logs
    const dataBucket = new WdkS3(this, 'DataBucket', {
      bucketName: `${this.stackName}-data`,
      serverAccessLogsBucket: this.logsBucket,
      serverAccessLogsPrefix: 'data-bucket/',
    });

    const uploadBucket = new WdkS3(this, 'UploadBucket', {
      bucketName: `${this.stackName}-uploads`,
      serverAccessLogsBucket: this.logsBucket,
      serverAccessLogsPrefix: 'upload-bucket/',
    });
  }
}
```

## Tips and Best Practices

### 1. Naming Conventions
Always include the stack name and stage in bucket names:
```typescript
bucketName: `${this.stackName}-${purpose}`
```

### 2. Environment-Specific Configuration
Use different settings for dev/staging/prod:
```typescript
const isProduction = stage === 'prod';
removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
```

### 3. Cost Optimization
- Use Intelligent Tiering for unpredictable access patterns
- Set lifecycle rules to transition old data to cheaper storage classes
- Clean up incomplete multipart uploads (enabled by default)

### 4. Security
- Never disable public access blocking unless absolutely necessary
- Use KMS encryption for sensitive data
- Enable versioning for important data
- Always enable access logging for audit trails

### 5. Performance
- Use CloudFront for frequently accessed content
- Enable transfer acceleration for large file uploads
- Consider using S3 Select for querying data in place

### 6. Monitoring
- Enable EventBridge for real-time event processing
- Monitor access logs for unusual patterns
- Set up CloudWatch alarms for bucket metrics

import { Construct } from 'constructs';
import {
  aws_s3 as s3,
  aws_kms as kms,
  RemovalPolicy,
  Duration,
  Fn,
} from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';

interface WdkS3DefaultsConfig {
  deepArchiveTransitionEnabled: boolean;
  deepArchiveTransitionUnit?: 'days' | 'weeks' | 'months' | 'years';
  deepArchiveTransitionValue?: number;
  expirationEnabled: boolean;
  expirationUnit?: 'days' | 'weeks' | 'months' | 'years';
  expirationValue?: number;
}

/**
 * Load WdkS3 defaults from wdk-s3-defaults.json
 */
function loadWdkS3Defaults(): WdkS3DefaultsConfig | undefined {
  try {
    const defaultsPath = path.join(process.cwd(), 'wdk', 'wdk-s3-defaults.json');
    if (fs.existsSync(defaultsPath)) {
      const content = fs.readFileSync(defaultsPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('Warning: Could not load wdk-s3-defaults.json:', error);
  }
  return undefined;
}

/**
 * Properties for the WdkS3 construct
 */
export interface WdkS3Props {
  /**
   * The project prefix and stage (e.g., 'myproject-dev').
   * Used to reference the foundation access logs bucket.
   * Format: '{prefix}-{stage}'
   */
  readonly prefix: string;

  /**
   * The name of the S3 bucket. If not provided, CloudFormation will generate a unique name.
   */
  readonly bucketName?: string;

  /**
   * The removal policy for the bucket. Defaults to RETAIN for safety.
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * Whether to enable auto-delete objects when the bucket is removed.
   * Only works when removalPolicy is DESTROY.
   * @default false
   */
  readonly autoDeleteObjects?: boolean;

  /**
   * Custom KMS key for bucket encryption. If not provided, uses S3 managed encryption.
   * @default undefined (uses S3 managed encryption)
   */
  readonly encryptionKey?: kms.IKey;

  /**
   * Whether to enable versioning on the bucket.
   * @default true
   */
  readonly versioned?: boolean;

  /**
   * Whether to enable server access logging.
   * @default true
   */
  readonly serverAccessLogsEnabled?: boolean;

  /**
   * Override the default foundation access logs bucket name.
   * By default, uses the foundation bucket: '{prefix}-access-logs'
   * Only use this if you need to log to a different bucket.
   */
  readonly serverAccessLogsBucketNameOverride?: string;

  /**
   * The prefix for server access logs within the access logs bucket.
   * @default 'access-logs/'
   */
  readonly serverAccessLogsPrefix?: string;

  /**
   * Custom lifecycle rules. If not provided, default rules will be applied.
   */
  readonly lifecycleRules?: s3.LifecycleRule[];

  /**
   * Whether to apply default lifecycle rules.
   * @default true
   */
  readonly applyDefaultLifecycleRules?: boolean;

  /**
   * Whether to enable intelligent tiering.
   * @default true
   */
  readonly enableIntelligentTiering?: boolean;

  /**
   * CORS configuration for the bucket.
   */
  readonly cors?: s3.CorsRule[];

  /**
   * Whether to enforce SSL for all requests.
   * @default true
   */
  readonly enforceSSL?: boolean;

  /**
   * Whether to enable event bridge notifications.
   * @default false
   */
  readonly eventBridgeEnabled?: boolean;

  /**
   * Additional bucket properties to override defaults.
   */
  readonly additionalProps?: Partial<s3.BucketProps>;
}

/**
 * WdkS3 - A best practice S3 bucket construct with security and lifecycle management
 * 
 * This construct creates an S3 bucket with the following best practices:
 * - Encryption at rest (S3 managed or KMS)
 * - Block all public access
 * - Versioning enabled
 * - Server access logging
 * - Intelligent tiering for cost optimization
 * - Standard lifecycle rules
 * - SSL enforcement
 * - Secure bucket policies
 * 
 * @example
 * ```typescript
 * const bucket = new WdkS3(this, 'MyBucket', {
 *   prefix: 'myproject-dev',
 *   bucketName: 'my-secure-bucket',
 *   versioned: true,
 * });
 * ```
 */
export class WdkS3 extends Construct {
  /**
   * The S3 bucket instance
   */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: WdkS3Props) {
    super(scope, id);

    // Load WdkS3 defaults configuration
    const wdkDefaults = loadWdkS3Defaults();

    // Set defaults
    const versioned = props.versioned ?? true;
    const serverAccessLogsEnabled = props.serverAccessLogsEnabled ?? true;
    const applyDefaultLifecycleRules = props.applyDefaultLifecycleRules ?? true;
    const enableIntelligentTiering = props.enableIntelligentTiering ?? true;
    const enforceSSL = props.enforceSSL ?? true;
    const removalPolicy = props.removalPolicy ?? RemovalPolicy.RETAIN;
    const autoDeleteObjects = props.autoDeleteObjects ?? false;

    // Get the foundation access logs bucket
    let serverAccessLogsBucket: s3.IBucket | undefined;
    if (serverAccessLogsEnabled) {
      const logsBucketName = props.serverAccessLogsBucketNameOverride || `${props.prefix}-access-logs`;
      const logsBucketArn = `arn:aws:s3:::${logsBucketName}`;
      
      serverAccessLogsBucket = s3.Bucket.fromBucketAttributes(this, 'AccessLogsBucket', {
        bucketName: logsBucketName,
        bucketArn: logsBucketArn,
      });
    }

    // Build lifecycle rules
    const lifecycleRules: s3.LifecycleRule[] = props.lifecycleRules || [];
    
    if (applyDefaultLifecycleRules && !props.lifecycleRules) {
      // Helper function to create Duration from unit and value
      const createDuration = (value: number, unit: string): Duration => {
        switch (unit) {
          case 'days':
            return Duration.days(value);
          case 'weeks':
            return Duration.days(value * 7);
          case 'months':
            return Duration.days(value * 31); //For compliance, we choose to error on the side of caution to account for months with 30 days
          case 'years':
            return Duration.days(value * 366); //For compliance, we choose to error on the side of caution to account for leap years
          default:
            return Duration.days(value);
        }
      };

      // Build transitions array based on configuration
      const transitions: s3.Transition[] = [];
      
      // Always start with Intelligent Tiering if enabled
      if (enableIntelligentTiering) {
        transitions.push({
          storageClass: s3.StorageClass.INTELLIGENT_TIERING,
          transitionAfter: Duration.days(0),
        });
      }
      
      // Add Deep Archive transition if configured
      if (wdkDefaults?.deepArchiveTransitionEnabled && 
          wdkDefaults.deepArchiveTransitionValue && 
          wdkDefaults.deepArchiveTransitionUnit) {
        transitions.push({
          storageClass: s3.StorageClass.DEEP_ARCHIVE,
          transitionAfter: createDuration(
            wdkDefaults.deepArchiveTransitionValue,
            wdkDefaults.deepArchiveTransitionUnit
          ),
        });
      }
      
      // Create main lifecycle rule with transitions and optional expiration
      const mainLifecycleRule: s3.LifecycleRule = {
        id: 'DefaultLifecyclePolicy',
        enabled: true,
        transitions: transitions.length > 0 ? transitions : undefined,
        expiration: (wdkDefaults?.expirationEnabled && 
                     wdkDefaults.expirationValue && 
                     wdkDefaults.expirationUnit) 
          ? createDuration(wdkDefaults.expirationValue, wdkDefaults.expirationUnit)
          : undefined,
      };
      
      lifecycleRules.push(mainLifecycleRule);

      // Clean up incomplete multipart uploads
      lifecycleRules.push({
        id: 'AbortIncompleteMultipartUpload',
        enabled: true,
        abortIncompleteMultipartUploadAfter: Duration.days(7),
      });

      // Manage non-current versions if versioning is enabled
      if (versioned) {
        lifecycleRules.push({
          id: 'ExpireOldVersions',
          enabled: true,
          noncurrentVersionExpiration: Duration.days(90),
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
        });
      }
    }

    // Determine encryption configuration
    const encryption = props.encryptionKey
      ? s3.BucketEncryption.KMS
      : s3.BucketEncryption.S3_MANAGED;

    // Create the main bucket with best practices
    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      encryption: encryption,
      encryptionKey: props.encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: versioned,
      removalPolicy: removalPolicy,
      autoDeleteObjects: autoDeleteObjects,
      serverAccessLogsBucket: serverAccessLogsBucket,
      serverAccessLogsPrefix: props.serverAccessLogsPrefix || 'access-logs/',
      lifecycleRules: lifecycleRules,
      cors: props.cors,
      eventBridgeEnabled: props.eventBridgeEnabled ?? false,
      enforceSSL: enforceSSL,
      minimumTLSVersion: 1.2,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      publicReadAccess: false,
      ...props.additionalProps,
    });
  }

  /**
   * Grant read permissions to an identity
   */
  public grantRead(identity: any) {
    return this.bucket.grantRead(identity);
  }

  /**
   * Grant write permissions to an identity
   */
  public grantWrite(identity: any) {
    return this.bucket.grantWrite(identity);
  }

  /**
   * Grant read/write permissions to an identity
   */
  public grantReadWrite(identity: any) {
    return this.bucket.grantReadWrite(identity);
  }

  /**
   * Grant delete permissions to an identity
   */
  public grantDelete(identity: any) {
    return this.bucket.grantDelete(identity);
  }

  /**
   * Grant put permissions to an identity
   */
  public grantPut(identity: any) {
    return this.bucket.grantPut(identity);
  }

  /**
   * Add a lifecycle rule to the bucket
   */
  public addLifecycleRule(rule: s3.LifecycleRule) {
    this.bucket.addLifecycleRule(rule);
  }

  /**
   * Add a CORS rule to the bucket
   */
  public addCorsRule(rule: s3.CorsRule) {
    this.bucket.addCorsRule(rule);
  }

  /**
   * Get the bucket ARN
   */
  public get bucketArn(): string {
    return this.bucket.bucketArn;
  }

  /**
   * Get the bucket name
   */
  public get bucketName(): string {
    return this.bucket.bucketName;
  }

  /**
   * Get the bucket domain name
   */
  public get bucketDomainName(): string {
    return this.bucket.bucketDomainName;
  }

  /**
   * Get the bucket regional domain name
   */
  public get bucketRegionalDomainName(): string {
    return this.bucket.bucketRegionalDomainName;
  }

  /**
   * Get the bucket website URL
   */
  public get bucketWebsiteUrl(): string {
    return this.bucket.bucketWebsiteUrl;
  }
}

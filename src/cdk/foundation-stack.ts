import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { WdkModule, WdkModuleProps } from './wdk-module';


export interface FoundationStackProps extends WdkModuleProps {
  prefixName: string;
  stageName: string;
  createdBy: string;
}

export class FoundationStack extends WdkModule<FoundationStackProps> {


  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

  }
    protected initialize(): void {
    const prefixStage = `${this.prefixName}-${this.stageName}`;

    // Create KMS key for encryption across all modules
    const encryptionKey = new kms.Key(this, `${prefixStage}-kms-key`, {
      enableKeyRotation: true,
      description: `Encryption key for ${prefixStage} resources`,
      alias: `alias/${prefixStage}-kms-key`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create centralized access logs bucket
    const accessLogsBucket = new s3.Bucket(this, `${prefixStage}-access-logs`, {
      bucketName: `${prefixStage}-access-logs`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'DeleteOldAccessLogs',
          enabled: true,
          expiration: cdk.Duration.days(90),
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(60),
            },
          ],
        },
      ],
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    // Create DynamoDB table for configuration
    const configTable = new dynamodb.Table(this, `${prefixStage}-config`, {
      tableName: `${prefixStage}-config`,
      partitionKey: {
        name: 'stackName',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'propertyName',
        type: dynamodb.AttributeType.STRING,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    configTable.node.addDependency(encryptionKey);

    // Add initial foundation stack metadata
    const timestamp = new Date().toISOString();
    



    this.createOutput('CreatedAt', timestamp , 'string', true)
    this.createOutput('LastUpdatedAt', timestamp , 'number', true);
    this.createOutput('CreatedBy', this.props.createdBy, 'string', true);
    this.createOutput('ConfigTableName', configTable.tableName, 'string', true);
    this.createOutput('ConfigTableArn', configTable.tableArn, 'arn', true);
    this.createOutput('EncryptionKeyId', encryptionKey.keyId, 'string', true);
    this.createOutput('EncryptionKeyArn', encryptionKey.keyArn, 'arn', true);
    this.createOutput('AccessLogsBucketName', accessLogsBucket.bucketName, 'string', true);
    this.createOutput('AccessLogsBucketArn', accessLogsBucket.bucketArn, 'arn', true);

  }
}

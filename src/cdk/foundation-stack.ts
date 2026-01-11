import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {
  prefixName: string;
  stageName: string;
  createdBy: string;
}

export class FoundationStack extends cdk.Stack {
  public readonly configTable: dynamodb.Table;
  public readonly encryptionKey: kms.Key;
  public readonly accessLogsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    const { prefixName, stageName, createdBy } = props;
    const prefixKey = `${prefixName}-${stageName}`;
    const tableName = `${prefixName}-${stageName}-config`;

    // Create KMS key for encryption across all modules
    this.encryptionKey = new kms.Key(this, `${prefixKey}-kms-key`, {
      enableKeyRotation: true,
      description: `Encryption key for ${prefixKey} resources`,
      alias: `${prefixKey}-kms-key`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create centralized access logs bucket
    this.accessLogsBucket = new s3.Bucket(this, `${prefixKey}-access-logs`, {
      bucketName: `${prefixKey}-access-logs`,
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
    this.configTable = new dynamodb.Table(this, `${prefixKey}-config-table`, {
      tableName,
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

    this.configTable.node.addDependency(this.encryptionKey);

    // Add initial foundation stack metadata
    const timestamp = new Date().toISOString();
    
    // Create custom resource to populate initial data
    const populateTableFunction = new cdk.CustomResource(this, 'PopulateConfigTable', {
      serviceToken: this.createPopulateTableProvider().serviceToken,
      properties: {
        TableName: this.configTable.tableName,
        Items: [
          {
            stackName: 'foundation',
            propertyName: 'createdAt',
            value: timestamp,
          },
          {
            stackName: 'foundation',
            propertyName: 'lastUpdatedAt',
            value: timestamp,
          },
          {
            stackName: 'foundation',
            propertyName: 'createdBy',
            value: createdBy,
          },
        ],
      },
    });

    populateTableFunction.node.addDependency(this.configTable);

    // Output the table name
    new cdk.CfnOutput(this, 'ConfigTableName', {
      value: this.configTable.tableName,
      description: 'Bluvations Configuration Table Name',
      exportName: `${prefixName}-${stageName}-config-table-name`,
    });

    new cdk.CfnOutput(this, 'ConfigTableArn', {
      value: this.configTable.tableArn,
      description: 'Bluvations Configuration Table ARN',
      exportName: `${prefixName}-${stageName}-config-table-arn`,
    });

    // Output the KMS key details
    new cdk.CfnOutput(this, 'EncryptionKeyId', {
      value: this.encryptionKey.keyId,
      description: 'Bluvations KMS Encryption Key ID',
      exportName: `${prefixName}-${stageName}-encryption-key-id`,
    });

    new cdk.CfnOutput(this, 'EncryptionKeyArn', {
      value: this.encryptionKey.keyArn,
      description: 'Bluvations KMS Encryption Key ARN',
      exportName: `${prefixName}-${stageName}-encryption-key-arn`,
    });

    // Output the access logs bucket details
    new cdk.CfnOutput(this, 'AccessLogsBucketName', {
      value: this.accessLogsBucket.bucketName,
      description: 'Centralized Access Logs Bucket Name',
      exportName: `${prefixName}-${stageName}-access-logs-bucket-name`,
    });

    new cdk.CfnOutput(this, 'AccessLogsBucketArn', {
      value: this.accessLogsBucket.bucketArn,
      description: 'Centralized Access Logs Bucket ARN',
      exportName: `${prefixName}-${stageName}-access-logs-bucket-arn`,
    });
  }

  private createPopulateTableProvider(): cdk.custom_resources.Provider {
    const onEventHandler = new cdk.aws_lambda.Function(this, 'PopulateTableHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: cdk.aws_lambda.Code.fromInline(`
        const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
        const { marshall } = require('@aws-sdk/util-dynamodb');

        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          
          if (event.RequestType === 'Delete') {
            return { PhysicalResourceId: event.PhysicalResourceId };
          }

          const tableName = event.ResourceProperties.TableName;
          const items = event.ResourceProperties.Items;
          const client = new DynamoDBClient({});

          try {
            for (const item of items) {
              await client.send(new PutItemCommand({
                TableName: tableName,
                Item: marshall({
                  stackName: item.stackName,
                  propertyName: item.propertyName,
                  value: item.value,
                }),
              }));
            }
            
            return {
              PhysicalResourceId: tableName + '-populated',
              Data: { Success: 'true' },
            };
          } catch (error) {
            console.error('Error populating table:', error);
            throw error;
          }
        };
      `),
      timeout: cdk.Duration.seconds(30),
    });

    // Grant permissions to write to the table
    this.configTable.grantWriteData(onEventHandler);

    return new cdk.custom_resources.Provider(this, 'PopulateTableProvider', {
      onEventHandler,
    });
  }
}

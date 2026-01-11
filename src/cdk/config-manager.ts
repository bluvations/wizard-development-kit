import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface ConfigProperty {
  stackName: string;
  propertyName: string;
  value: any;
  type: string;
}

export interface ConfigReaderProps {
  tableName: string;
  stackName: string;
  propertyNames: string[];
}

export interface ConfigWriterProps {
  tableName: string;
  stackName: string;
  properties: Array<{
    propertyName: string;
    value: any;
    type: string;
  }>;
}

/**
 * Reads configuration values from the DynamoDB config table
 */
export class ConfigReader extends Construct {
  public readonly properties: { [key: string]: string };

  constructor(scope: Construct, id: string, props: ConfigReaderProps) {
    super(scope, id);

    this.properties = {};

    // Create a custom resource to read from DynamoDB
    const reader = new cr.AwsCustomResource(this, 'ConfigReader', {
      onUpdate: {
        service: 'DynamoDB',
        action: 'batchGetItem',
        parameters: {
          RequestItems: {
            [props.tableName]: {
              Keys: props.propertyNames.map(propName => ({
                stackName: { S: props.stackName },
                propertyName: { S: propName },
              })),
            },
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${props.stackName}-config-reader-${Date.now()}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [
          `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.tableName}`,
        ],
      }),
    });

    // Store property references
    props.propertyNames.forEach((propName, index) => {
      this.properties[propName] = reader.getResponseField(
        `Responses.${props.tableName}.${index}.value.S`
      );
    });
  }

  /**
   * Get a configuration value by property name
   */
  public getValue(propertyName: string): string {
    return this.properties[propertyName] || '';
  }
}

/**
 * Writes configuration values to the DynamoDB config table
 */
export class ConfigWriter extends Construct {
  constructor(scope: Construct, id: string, props: ConfigWriterProps) {
    super(scope, id);

    // Create a single custom resource to write all properties using BatchWriteItem
    const writeRequests = props.properties.map(prop => ({
      PutRequest: {
        Item: {
          stackName: { S: props.stackName },
          propertyName: { S: prop.propertyName },
          value: { S: typeof prop.value === 'string' ? prop.value : JSON.stringify(prop.value) },
          type: { S: prop.type },
        },
      },
    }));

    // Split into batches of 25 (DynamoDB BatchWriteItem limit)
    const batchSize = 25;
    const batches = [];
    for (let i = 0; i < writeRequests.length; i += batchSize) {
      batches.push(writeRequests.slice(i, i + batchSize));
    }

    // Create a custom resource for each batch (if needed)
    batches.forEach((batch, batchIndex) => {
      const resourceId = batches.length > 1 ? `Writer-Batch${batchIndex}` : 'Writer';
      
      new cr.AwsCustomResource(this, resourceId, {
        onCreate: {
          service: 'DynamoDB',
          action: 'batchWriteItem',
          parameters: {
            RequestItems: {
              [props.tableName]: batch,
            },
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${props.stackName}-config-writer-${batchIndex}-${Date.now()}`
          ),
        },
        onUpdate: {
          service: 'DynamoDB',
          action: 'batchWriteItem',
          parameters: {
            RequestItems: {
              [props.tableName]: batch,
            },
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${props.stackName}-config-writer-${batchIndex}-${Date.now()}`
          ),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: [
            `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${props.tableName}`,
          ],
        }),
      });
    });
  }
}

/**
 * Helper function to create a config table reference
 */
export function getConfigTableName(prefixName: string, stageName: string): string {
  return `${prefixName}-${stageName}-config`;
}

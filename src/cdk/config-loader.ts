import { DynamoDBClient, BatchGetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

export interface ConfigValue {
  stackName: string;
  propertyName: string;
  value: string;
  type: string;
}

export interface LoadedConfig {
  [key: string]: string; // Format: "stackName.propertyName" -> value
}

/**
 * Loads configuration values from DynamoDB at synthesis time
 * This ensures that config changes trigger stack updates
 */
export async function loadConfigFromDynamoDB(
  tableName: string,
  requiredInputs: string[],
  region: string
): Promise<LoadedConfig> {
  if (!requiredInputs || requiredInputs.length === 0) {
    return {};
  }

  const client = new DynamoDBClient({ region });
  const config: LoadedConfig = {};

  try {
    // Parse required inputs into stack/property pairs
    const keys = requiredInputs.map(input => {
      const [stackName, propertyName] = input.split('.');
      return {
        stackName: { S: stackName },
        propertyName: { S: propertyName },
      };
    });

    // Batch get items from DynamoDB
    const response = await client.send(
      new BatchGetItemCommand({
        RequestItems: {
          [tableName]: {
            Keys: keys,
          },
        },
      })
    );

    // Process the response
    if (response.Responses && response.Responses[tableName]) {
      response.Responses[tableName].forEach((item: Record<string, any>) => {
        const unmarshalled = unmarshall(item);
        const key = `${unmarshalled.stackName}.${unmarshalled.propertyName}`;
        config[key] = unmarshalled.value;
      });
    }

    // Verify all required inputs were found
    requiredInputs.forEach(input => {
      if (!(input in config)) {
        throw new Error(
          `Required config value not found in DynamoDB: ${input}\n` +
          `Table: ${tableName}\n` +
          `Make sure the stack that provides this value has been deployed.`
        );
      }
    });

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config from DynamoDB: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Helper to get a specific config value from loaded config
 */
export function getConfigValue(config: LoadedConfig, stackName: string, propertyName: string): string {
  const key = `${stackName}.${propertyName}`;
  const value = config[key];
  
  if (value === undefined) {
    throw new Error(`Config value not found: ${key}`);
  }
  
  return value;
}

/**
 * Helper function to create a config table name
 */
export function getConfigTableName(prefixName: string, stageName: string): string {
  return `wdk-${prefixName}-${stageName}-config`;
}

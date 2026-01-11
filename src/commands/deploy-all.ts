import { Command } from 'commander';

export function createDeployAllCommand(): Command {
  return new Command('deploy-all')
    .description('Deploy all configured targets')
    .action(() => {
      console.log('🚀 Deploying all targets...');
      // TODO: Implement deploy-all functionality
    });
}

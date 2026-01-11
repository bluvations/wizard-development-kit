import { Command } from 'commander';

export function createAddModuleCommand(): Command {
  return new Command('add-module')
    .description('Add a module to the current project')
    .argument('<module-name>', 'Name of the module to add')
    .action((moduleName: string) => {
      console.log(`📦 Adding module: ${moduleName}...`);
      // TODO: Implement add-module functionality
    });
}

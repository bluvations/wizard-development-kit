import { Command } from 'commander';

export function createSynthAllCommand(): Command {
  return new Command('synth-all')
    .description('Synthesize configuration for all targets')
    .action(() => {
      console.log('⚗️  Synthesizing all targets...');
      // TODO: Implement synth-all functionality
    });
}

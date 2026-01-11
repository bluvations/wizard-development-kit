#!/usr/bin/env node

import { Command } from 'commander';
import packageJson from '../package.json';
import {
  createInitCommand,
  createAddStageCommand,
  createCreateModuleCommand,
  createAddModuleCommand,
  createDeployCommand,
  createDeployAllCommand,
  createSynthCommand,
  createSynthAllCommand,
} from './commands';

// Wizard's Deployment Kit - conjure CLI (foundation)
// For now, it simply prints a hello message. Future versions will orchestrate repo/framework installs.

const program = new Command();

program
  .name('conjure')
  .description('Wizard\'s Deployment Kit - Bootstrap repositories and frameworks with magic ✨')
  .version(packageJson.version, '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display help for command');

// Register all subcommands
program.addCommand(createInitCommand());
program.addCommand(createAddStageCommand());
program.addCommand(createCreateModuleCommand());
program.addCommand(createAddModuleCommand());
program.addCommand(createDeployCommand());
program.addCommand(createDeployAllCommand());
program.addCommand(createSynthCommand());
program.addCommand(createSynthAllCommand());

// Default action when no subcommands are provided
program.action(() => {
  console.log("✨ Hello from Wizard's Deployment Kit! The conjure has begun. ✨");
  console.log("\nRun 'conjure --help' to see available commands.");
});

program.parse(process.argv);

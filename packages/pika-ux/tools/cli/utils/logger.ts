import chalk from 'chalk';
import ora, { Ora } from 'ora';

export class Logger {
    private spinner: Ora | null = null;

    info(message: string, ...args: any[]) {
        console.log(chalk.blue('ℹ'), message, ...args);
    }

    success(message: string, ...args: any[]) {
        console.log(chalk.green('✓'), message, ...args);
    }

    warn(message: string, ...args: any[]) {
        console.log(chalk.yellow('⚠'), message, ...args);
    }

    error(message: string, ...args: any[]) {
        console.error(chalk.red('✗'), message, ...args);
    }

    debug(message: string, ...args: any[]) {
        if (process.env.DEBUG || process.env.PIKA_DEBUG) {
            console.log(chalk.gray('🐛'), message, ...args);
        }
    }

    startSpinner(text: string) {
        this.spinner = ora(text).start();
        return this.spinner;
    }

    stopSpinner(success: boolean = true, text?: string) {
        if (this.spinner) {
            if (success) {
                this.spinner.succeed(text);
            } else {
                this.spinner.fail(text);
            }
            this.spinner = null;
        }
    }

    updateSpinner(text: string) {
        if (this.spinner) {
            this.spinner.text = text;
        }
    }

    newLine() {
        console.log();
    }

    divider() {
        console.log(chalk.gray('─'.repeat(50)));
    }
}

export const logger = new Logger();

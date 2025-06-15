import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { logger } from '../utils/logger';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('Logger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('info', () => {
        it('should log info messages with blue icon', () => {
            logger.info('Test info message');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('ℹ'), 'Test info message');
        });

        it('should log info messages with additional arguments', () => {
            const testObj = { key: 'value' };
            logger.info('Test message', testObj);

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('ℹ'), 'Test message', testObj);
        });
    });

    describe('success', () => {
        it('should log success messages with green checkmark', () => {
            logger.success('Test success message');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✓'), 'Test success message');
        });
    });

    describe('warn', () => {
        it('should log warning messages with yellow warning icon', () => {
            logger.warn('Test warning message');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚠'), 'Test warning message');
        });
    });

    describe('error', () => {
        it('should log error messages with red X icon', () => {
            logger.error('Test error message');

            expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('✗'), 'Test error message');
        });
    });

    describe('debug', () => {
        it('should not log debug messages by default', () => {
            logger.debug('Test debug message');

            expect(mockConsoleLog).not.toHaveBeenCalled();
        });

        it('should log debug messages when DEBUG env var is set', () => {
            process.env.DEBUG = 'true';

            logger.debug('Test debug message');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🐛'), 'Test debug message');

            delete process.env.DEBUG;
        });

        it('should log debug messages when PIKA_DEBUG env var is set', () => {
            process.env.PIKA_DEBUG = 'true';

            logger.debug('Test debug message');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🐛'), 'Test debug message');

            delete process.env.PIKA_DEBUG;
        });
    });

    describe('table', () => {
        it('should display data in table format', () => {
            const testData = {
                Project: 'my-pika-app',
                Version: '1.0.0',
                Author: 'Test User'
            };

            logger.table(testData);

            expect(mockConsoleLog).toHaveBeenCalledTimes(3);
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Project'));
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('my-pika-app'));
        });
    });

    describe('header', () => {
        it('should display header with divider', () => {
            logger.header('Test Header');

            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Test Header'));
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('─'));
        });
    });

    describe('newLine', () => {
        it('should log empty line', () => {
            logger.newLine();

            expect(mockConsoleLog).toHaveBeenCalledWith();
        });
    });
});

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { configManager, type PikaConfig } from '../utils/config-manager';
import { fileManager } from '../utils/file-manager';
import path from 'path';

// Mock file manager
jest.mock('../utils/file-manager');
const mockFileManager = fileManager as jest.Mocked<typeof fileManager>;

describe('ConfigManager', () => {
    const testProjectPath = '/test/project';
    const mockConfig: PikaConfig = {
        projectName: 'test-project',
        version: '1.0.0',
        framework: {
            version: '1.0.0',
            lastSync: '2023-01-01T00:00:00.000Z'
        },
        auth: {
            provider: 'mock',
            options: {}
        },
        components: {
            customDirectory: './custom-components',
            autoDiscovery: true
        },
        services: {
            organization: 'monorepo',
            customDirectory: './services/custom'
        },
        deployment: {
            region: 'us-east-1',
            stage: 'dev'
        },
        features: {
            sampleWeatherApp: true,
            enterpriseFeatures: false
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('loadConfig', () => {
        it('should load existing configuration', async () => {
            mockFileManager.exists.mockResolvedValue(true);
            mockFileManager.readJsonFile.mockResolvedValue(mockConfig);

            const result = await configManager.loadConfig(testProjectPath);

            expect(result).toEqual(mockConfig);
            expect(mockFileManager.exists).toHaveBeenCalledWith(path.join(testProjectPath, 'pika.config.json'));
        });

        it('should return null if config file does not exist', async () => {
            mockFileManager.exists.mockResolvedValue(false);

            const result = await configManager.loadConfig(testProjectPath);

            expect(result).toBeNull();
        });
    });

    describe('saveConfig', () => {
        it('should save configuration to file', async () => {
            mockFileManager.writeJsonFile.mockResolvedValue();

            await configManager.saveConfig(mockConfig, testProjectPath);

            expect(mockFileManager.writeJsonFile).toHaveBeenCalledWith(path.join(testProjectPath, 'pika.config.json'), mockConfig);
        });
    });

    describe('isPikaProject', () => {
        it('should return true if config file exists', async () => {
            mockFileManager.exists.mockResolvedValue(true);

            const result = await configManager.isPikaProject(testProjectPath);

            expect(result).toBe(true);
        });

        it('should return false if config file does not exist', async () => {
            mockFileManager.exists.mockResolvedValue(false);

            const result = await configManager.isPikaProject(testProjectPath);

            expect(result).toBe(false);
        });
    });

    describe('createDefaultConfig', () => {
        it('should create default configuration with project name', () => {
            const projectName = 'my-test-project';
            const result = configManager.createDefaultConfig(projectName);

            expect(result.projectName).toBe(projectName);
            expect(result.auth.provider).toBe('mock');
            expect(result.services.organization).toBe('monorepo');
            expect(result.deployment.region).toBe('us-east-1');
            expect(result.features.sampleWeatherApp).toBe(true);
        });
    });

    describe('validateConfig', () => {
        it('should validate a correct configuration', async () => {
            mockFileManager.exists.mockResolvedValue(true);

            const result = await configManager.validateConfig(mockConfig);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should return errors for missing required fields', async () => {
            const invalidConfig = { ...mockConfig };
            invalidConfig.projectName = '';

            const result = await configManager.validateConfig(invalidConfig);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Project name is required');
        });

        it('should return errors for invalid auth provider', async () => {
            const invalidConfig = { ...mockConfig };
            // @ts-ignore - Testing invalid value
            invalidConfig.auth.provider = 'invalid-provider';

            const result = await configManager.validateConfig(invalidConfig);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Invalid auth provider: invalid-provider');
        });

        it('should return warnings for missing directories', async () => {
            mockFileManager.exists.mockResolvedValue(false);

            const result = await configManager.validateConfig(mockConfig);

            expect(result.warnings).toContain(expect.stringContaining('Custom components directory does not exist'));
            expect(result.warnings).toContain(expect.stringContaining('Custom services directory does not exist'));
        });
    });

    describe('updateConfig', () => {
        it('should update existing configuration', async () => {
            mockFileManager.readJsonFile.mockResolvedValue(mockConfig);
            mockFileManager.writeJsonFile.mockResolvedValue();

            const updates = { version: '2.0.0' };
            const result = await configManager.updateConfig(updates, testProjectPath);

            expect(result.version).toBe('2.0.0');
            expect(result.projectName).toBe(mockConfig.projectName); // Should preserve other fields
            expect(mockFileManager.writeJsonFile).toHaveBeenCalled();
        });

        it('should create default config if none exists', async () => {
            mockFileManager.readJsonFile.mockResolvedValue(null);
            mockFileManager.writeJsonFile.mockResolvedValue();

            const updates = { projectName: 'new-project' };
            const result = await configManager.updateConfig(updates, testProjectPath);

            expect(result.projectName).toBe('new-project');
            expect(mockFileManager.writeJsonFile).toHaveBeenCalled();
        });
    });

    describe('getProjectInfo', () => {
        it('should return project information', async () => {
            const mockPackageJson = {
                name: 'test-project',
                version: '1.2.3'
            };

            mockFileManager.readJsonFile.mockResolvedValue(mockPackageJson);
            mockFileManager.exists.mockResolvedValue(true);

            const result = await configManager.getProjectInfo(testProjectPath);

            expect(result.name).toBe('test-project');
            expect(result.version).toBe('1.2.3');
            expect(result.isPikaProject).toBe(true);
        });

        it('should handle missing package.json', async () => {
            mockFileManager.readJsonFile.mockResolvedValue(null);
            mockFileManager.exists.mockResolvedValue(false);

            const result = await configManager.getProjectInfo(testProjectPath);

            expect(result.name).toBe(path.basename(testProjectPath));
            expect(result.version).toBe('0.0.0');
            expect(result.isPikaProject).toBe(false);
        });
    });
});

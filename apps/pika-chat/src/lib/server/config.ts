import { env } from '$env/dynamic/private';
import { getValueFromParameterStore } from './ssm';
import type { AppConfig } from './server-types';
import { getLoggedInAccountFromSts } from './sts';

/**
 * We are doing config this way because sometimes it's OK to get the config from the environment
 * and sometimes, though not often, we have to go to SSM to get the config at run time
 * because it's secret or sensitive and we don't want to put it in an env variable.
 */
export class AppConfigProxy implements AppConfig {
    private static instance: AppConfigProxy;

    private _webappUrl: string | undefined;
    private _redirectCallbackUriPath: string | undefined;
    private _awsRegion: string | undefined;
    private _awsAccount: string | undefined;
    private _uploadS3Bucket: string | undefined;
    private _stage: string | undefined;
    private _isLocal: boolean | undefined;
    private _masterCookieKey: string | undefined;
    private _masterCookieInitVector: string | undefined;
    private _chatApiId: string | undefined;
    private _converseFnUrl: string | undefined;
    private _chatAdminApiId: string | undefined;
    private _issuer: string | undefined;
    private _pikaServiceProjNameKebabCase: string | undefined;
    private _pikaChatProjNameKebabCase: string | undefined;

    // This is used to encrypt and decrypt user data when shared from the front end to the back end of the chatbot service
    // and not for authentication of the front end itself.
    private _jwtSecret: string | undefined;

    private constructor() {}

    public static getInstance(): AppConfigProxy {
        if (!AppConfigProxy.instance) {
            AppConfigProxy.instance = new AppConfigProxy();
        }
        return AppConfigProxy.instance;
    }

    public async init(): Promise<void> {
        const stage = env.STAGE ?? process.env.STAGE;
        if (!stage) {
            throw new Error('STAGE is not set');
        }

        const region = env.AWS_REGION ?? process.env.AWS_REGION;
        if (!region) {
            throw new Error('AWS_REGION is not set');
        }

        this._pikaServiceProjNameKebabCase = env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE ?? process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE;
        if (!this._pikaServiceProjNameKebabCase) {
            throw new Error('PIKA_SERVICE_PROJ_NAME_KEBAB_CASE is not set');
        }
        this._pikaChatProjNameKebabCase = env.PIKA_CHAT_PROJ_NAME_KEBAB_CASE ?? process.env.PIKA_CHAT_PROJ_NAME_KEBAB_CASE;
        if (!this._pikaChatProjNameKebabCase) {
            throw new Error('PIKA_CHAT_PROJ_NAME_KEBAB_CASE is not set');
        }

        const isLocal = env.NODE_ENV === 'development';
        const cache: {
            [key: string]: string | boolean;
        } = {};

        for (const configType of this.initConfig) {
            await configType.setValue(isLocal, stage, cache, region, this._pikaServiceProjNameKebabCase, this._pikaChatProjNameKebabCase);
        }
    }

    /** Doing it this way so you will get a typescript error if you don't have every key from the AppConfig interface. */
    private get initConfig(): ConfigType[] {
        return [
            {
                name: 'stage',
                setValue: async (_isLocal: boolean, stage: string, _cache: Cache) => {
                    this._stage = stage;
                }
            },
            {
                name: 'isLocal',
                setValue: async (isLocal: boolean, _stage: string, _cache: Cache) => {
                    this._isLocal = isLocal;
                }
            },
            {
                name: 'webappUrl',
                setValue: async (_isLocal: boolean, _stage: string, _cache: Cache) => {
                    const result = env.WEBAPP_URL ?? process.env.WEBAPP_URL;
                    if (!result) {
                        throw new Error('WEBAPP_URL is not set');
                    }
                    this._webappUrl = result;
                }
            },
            {
                name: 'issuer',
                setValue: async (_isLocal: boolean, _stage: string, _cache: Cache) => {
                    const result = env.OAUTH_URL ?? process.env.OAUTH_URL;
                    if (!result) {
                        throw new Error('OAUTH_URL is not set');
                    }
                    // The issuer is the same as the oauth url but without the /connect/authorize at the end
                    this._issuer = result.replace('connect/authorize', '');
                }
            },
            {
                name: 'redirectCallbackUriPath',
                setValue: async (_isLocal: boolean, _stage: string, _cache: Cache) => {
                    this._redirectCallbackUriPath = '/auth/callback';
                }
            },
            {
                name: 'awsRegion',
                setValue: async (_isLocal: boolean, _stage: string, cache: Cache) => {
                    let result = env.AWS_REGION ?? process.env.AWS_REGION;
                    if (!result) {
                        if (cache.awsRegion) {
                            result = cache.awsRegion as string;
                        } else {
                            const [accountId, region] = await getLoggedInAccountFromSts();
                            cache.awsRegion = region;
                            cache.awsAccount = accountId;
                            result = region;
                        }
                    }
                    this._awsRegion = result;
                }
            },
            {
                name: 'awsAccount',
                setValue: async (_isLocal: boolean, _stage: string, cache: Cache) => {
                    let result = env.AWS_ACCOUNT ?? process.env.AWS_ACCOUNT;
                    if (!result) {
                        if (cache.awsAccount) {
                            result = cache.awsAccount as string;
                        } else {
                            const [accountId, region] = await getLoggedInAccountFromSts();
                            cache.awsRegion = region;
                            cache.awsAccount = accountId;
                            result = accountId;
                        }
                    }
                    this._awsAccount = result;
                }
            },
            {
                name: 'uploadS3Bucket',
                setValue: async (_isLocal: boolean, _stage: string, _cache: Cache) => {
                    const result = env.UPLOAD_S3_BUCKET ?? process.env.UPLOAD_S3_BUCKET;
                    if (!result) {
                        throw new Error('UPLOAD_S3_BUCKET is not set');
                    }
                    this._uploadS3Bucket = result;
                }
            },
            {
                name: 'masterCookieKey',
                setValue: async (_isLocal: boolean, stage: string, _cache: Cache, region: string, _pikaServiceProjNameKebabCase: string, pikaChatProjNameKebabCase: string) => {
                    this._masterCookieKey = await getValueFromParameterStore(`/stack/${pikaChatProjNameKebabCase}/${stage}/auth/master-cookie-key`, region);
                }
            },
            {
                name: 'masterCookieInitVector',
                setValue: async (_isLocal: boolean, stage: string, _cache: Cache, region: string, _pikaServiceProjNameKebabCase: string, pikaChatProjNameKebabCase: string) => {
                    this._masterCookieInitVector = await getValueFromParameterStore(`/stack/${pikaChatProjNameKebabCase}/${stage}/auth/master-cookie-init-vector`, region);
                }
            },
            {
                name: 'chatApiId',
                setValue: async (_isLocal: boolean, stage: string, _cache: Cache) => {
                    const result = env.CHAT_API_ID ?? process.env.CHAT_API_ID;
                    if (!result) {
                        throw new Error('CHAT_API_ID is not set');
                    }
                    this._chatApiId = result;
                }
            },
            {
                name: 'chatAdminApiId',
                setValue: async (_isLocal: boolean, _stage: string, _cache: Cache) => {
                    this._chatAdminApiId = env.CHAT_ADMIN_API_ID ?? process.env.CHAT_ADMIN_API_ID;
                    if (!this._chatAdminApiId) {
                        throw new Error('CHAT_ADMIN_API_ID is not set');
                    }
                }
            },
            {
                name: 'jwtSecret',
                setValue: async (_isLocal: boolean, stage: string, _cache: Cache, region: string, pikaServiceProjNameKebabCase: string, _pikaChatProjNameKebabCase: string) => {
                    this._jwtSecret = await getValueFromParameterStore(`/stack/${pikaServiceProjNameKebabCase}/${stage}/jwt-secret`, region);
                }
            },
            {
                name: 'converseFnUrl',
                setValue: async (_isLocal: boolean, stage: string, _cache: Cache) => {
                    this._converseFnUrl = env.CONVERSE_FUNCTION_URL ?? process.env.CONVERSE_FUNCTION_URL;
                    if (!this._converseFnUrl) {
                        throw new Error('CONVERSE_FUNCTION_URL is not set');
                    }
                }
            }
        ];
    }

    public getArbitraryConfigValue(key: string): string {
        const value = env[key] ?? process.env[key];
        if (!value) {
            throw new Error(`${key} is not set in env or process.env`);
        }
        return value;
    }

    public get webappUrl(): string {
        if (!this._webappUrl) throw new Error('App config not initialized');
        return this._webappUrl;
    }

    public get redirectCallbackUriPath(): string {
        if (!this._redirectCallbackUriPath) throw new Error('App config not initialized');
        return this._redirectCallbackUriPath;
    }

    public get awsRegion(): string {
        if (!this._awsRegion) throw new Error('App config not initialized');
        return this._awsRegion;
    }

    public get awsAccount(): string {
        if (!this._awsAccount) throw new Error('App config not initialized');
        return this._awsAccount;
    }

    public get uploadS3Bucket(): string {
        if (!this._uploadS3Bucket) throw new Error('App config not initialized');
        return this._uploadS3Bucket;
    }

    public get stage(): string {
        if (!this._stage) throw new Error('App config not initialized');
        return this._stage;
    }

    public get isLocal(): boolean {
        if (this._isLocal === undefined) {
            throw new Error('App config not initialized: _isLocal is undefined');
        }
        return this._isLocal;
    }

    public get masterCookieKey(): string {
        if (!this._masterCookieKey) throw new Error('App config not initialized');
        return this._masterCookieKey;
    }

    public get masterCookieInitVector(): string {
        if (!this._masterCookieInitVector) throw new Error('App config not initialized');
        return this._masterCookieInitVector;
    }

    public get chatApiId(): string {
        if (!this._chatApiId) throw new Error('App config not initialized');
        return this._chatApiId;
    }

    public get chatAdminApiId(): string {
        if (!this._chatAdminApiId) throw new Error('App config not initialized');
        return this._chatAdminApiId;
    }

    public get jwtSecret(): string {
        if (!this._jwtSecret) throw new Error('App config not initialized');
        return this._jwtSecret;
    }

    public get converseFnUrl(): string {
        if (!this._converseFnUrl) throw new Error('App config not initialized');
        return this._converseFnUrl;
    }

    public get issuer(): string {
        if (!this._issuer) throw new Error('App config not initialized');
        return this._issuer;
    }

    public get pikaServiceProjNameKebabCase(): string {
        if (!this._pikaServiceProjNameKebabCase) throw new Error('App config not initialized');
        return this._pikaServiceProjNameKebabCase;
    }

    public get pikaChatProjNameKebabCase(): string {
        if (!this._pikaChatProjNameKebabCase) throw new Error('App config not initialized');
        return this._pikaChatProjNameKebabCase;
    }
}

interface ConfigType {
    name: keyof AppConfigProxy;
    setValue: (isLocal: boolean, stage: string, cache: Cache, region: string, pikaServiceProjNameKebabCase: string, pikaChatProjNameKebabCase: string) => Promise<void>;
}

interface Cache {
    [key: string]: string | boolean;
}

// Export a singleton instance. Be sure to call `await appConfig.init()` before using it.
export const appConfig = AppConfigProxy.getInstance();

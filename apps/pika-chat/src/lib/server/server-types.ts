/** Our app config, loaded on app startup from env variables or SSM. */
export interface AppConfig {
    /**
     * Whether we are running locally on a dev machine (local) or in a real environment.
     * Don't need to set this in environment variables, we will detect it.
     */
    isLocal: boolean;

    /**
     * The aws region for the chatbot app.  MUST be set in an environment variable.
     *
     * env variable: AWS_REGION
     */
    awsRegion: string;

    /**
     * The aws account for the chatbot app.  May be set in an environment variable, otherwise
     * whether running locally or not, we will use the logged in account info from STS.
     *
     * env variable: AWS_ACCOUNT
     */
    awsAccount: string;

    /**
     * Don't set this in an environment variable.  It will be ignored.  It's hardcoded in config.ts.
     */
    redirectCallbackUriPath: string;

    /**
     * Don't set this in an environment variable.  It will be ignored.  It is retrieved at run time from SSM.
     */
    masterCookieKey: string;

    /**
     * Don't set this in an environment variable.  It will be ignored.  It is retrieved at run time from SSM.
     */
    masterCookieInitVector: string;

    /**
     * Don't set this in an environment variable.  It will be ignored.  It is retrieved at run time from SSM.
     */
    jwtSecret: string;

    /**
     * Must be set in an environment variable.
     *
     * The fully qualified url for the webapp including the port if applicable.
     * Local will be something like http://localhost:3000  and prod will be the full https url
     *
     * env variable: WEBAPP_URL
     */
    webappUrl: string;

    /**
     * Must be set in an environment variable.
     * The base url for the platform api including getting user info after authenticated and so forth
     *
     * env variable: PLATFORM_API_BASE_URL
     */
    platformApiBaseUrl: string;

    /**
     * Must be set in an environment variable.
     * The url for the oauth provider
     *
     * env variable: OAUTH_URL
     */
    oauthUrl: string;

    /**
     * The url for the oauth provider to get tokens
     *
     * env variable: TOKEN_URL
     */
    tokenUrl: string;

    /**
     * Must be set in an environment variable.
     * The client id for the oauth provider for the chatbot app
     *
     * env variable: CLIENT_ID
     */
    clientId: string;

    /**
     * Must be set in an environment variable.
     * The s3 bucket where the chatbot app uploads files
     *
     * env variable: UPLOAD_S3_BUCKET
     */
    uploadS3Bucket: string;

    /**
     * Must be set in an environment variable.
     * The stage for the chatbot app as in dev/prod/etc.
     */
    stage: string;

    /**
     * Must be set in an environment variable.
     * The api id for the chatbot app
     *
     * env variable: CHAT_API_ID
     */
    chatApiId: string;

    /**
     * Must be set in an environment variable.
     * The url for the converse function
     *
     * env variable: CONVERSE_FUNCTION_URL
     */
    converseFnUrl: string;

    /**
     * This is the name of the backend pika service project from the pika-config.ts file.
     * Must be set in an environment variable.
     * The name of the pika service project in kebab case
     *
     * env variable: PIKA_SERVICE_PROJ_NAME_KEBAB_CASE
     */
    pikaServiceProjNameKebabCase: string;

    /**
     * This is the name of the frontend pika chat project from the pika-config.ts file.
     * Must be set in an environment variable.
     * The name of the pika chat project in kebab case
     *
     * env variable: PIKA_CHAT_PROJ_NAME_KEBAB_CASE
     */
    pikaChatProjNameKebabCase: string;

    /**
     * Get an arbitrary config value from the environment or process.env
     * @param key - The key to get the value for
     * @returns The value of the key
     */
    getArbitraryConfigValue(key: string): string;
}

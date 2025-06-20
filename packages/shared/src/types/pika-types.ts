export interface PikaConfig {
    pika: PikaStack;
    pikaChat: BaseStackConfig;
    weather?: BaseStackConfig;
}

export interface BaseStackConfig {
    projNameL: string; // All lowercase no stage name e.g. pika
    projNameKebabCase: string; // Kebab case no stage name e.g. pika
    projNameTitleCase: string; // Title case no stage name e.g. Pika
    projNameCamel: string; // Camel case no stage name e.g. pika
    projNameHuman: string; // Human readable no stage name e.g. Pika
}

export interface PikaStack extends BaseStackConfig {
    viteConfig?: {
        server?: ViteServerConfig;
        preview?: VitePreviewConfig;
    };
}

export interface ViteServerConfig {
    host?: string;
    port?: number;
    strictPort?: boolean;
    https?: {
        key: string; // Path to key file
        cert: string; // Path to cert file
    };
}

export interface VitePreviewConfig {
    host?: string;
    port?: number;
    strictPort?: boolean;
}
